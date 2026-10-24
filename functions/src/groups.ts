import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import {
  INVITE_CODE_ALPHABET,
  INVITE_CODE_LENGTH,
  MAX_GROUP_MEMBERS,
  type GroupDoc,
  type GroupSummary,
  type JoinGroupRequest,
  type JoinGroupResponse,
} from "./contract.js";
import { requireAuth, requireString } from "./validate.js";

// "save-42 ab" → "SAVE42AB". Returns null unless the result is a well-formed code.
export function normalizeInviteCode(raw: string): string | null {
  const code = raw.toUpperCase().replace(/[\s-]/g, "");
  const valid = code.length === INVITE_CODE_LENGTH && [...code].every((c) => INVITE_CODE_ALPHABET.includes(c));
  return valid ? code : null;
}

export function toGroupSummary(id: string, group: GroupDoc, viewerUid: string): GroupSummary {
  return {
    id,
    name: group.name,
    inviteCode: group.inviteCode,
    members: group.members.map((userId) => ({
      userId,
      displayName: group.memberNames[userId] ?? "Member",
      isMe: userId === viewerUid,
    })),
  };
}

export const joinGroup = onCall<JoinGroupRequest>(async (request): Promise<JoinGroupResponse> => {
  const uid = requireAuth(request);
  const code = normalizeInviteCode(requireString(request.data?.inviteCode, "inviteCode"));
  if (!code) throw new HttpsError("invalid-argument", "Invite codes are 6 letters and numbers.");

  const db = getFirestore();
  const match = await db.collection("groups").where("inviteCode", "==", code).limit(1).get();
  if (match.empty) throw new HttpsError("not-found", "No group uses that invite code.");

  // Read the name from Auth, not the ID token: a token minted before updateProfile won't have it.
  const displayName = (await getAuth().getUser(uid)).displayName || "Member";
  const ref = match.docs[0].ref;

  return db.runTransaction(async (tx) => {
    const group = (await tx.get(ref)).data() as GroupDoc;
    const alreadyMember = group.members.includes(uid);
    if (!alreadyMember) {
      if (group.members.length >= MAX_GROUP_MEMBERS) throw new HttpsError("failed-precondition", "This group is full.");
      tx.update(ref, { members: FieldValue.arrayUnion(uid), [`memberNames.${uid}`]: displayName });
      group.members.push(uid);
      group.memberNames[uid] = displayName;
    }
    return { group: toGroupSummary(ref.id, group, uid), alreadyMember };
  });
});
