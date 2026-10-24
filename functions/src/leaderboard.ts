import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import type { GetLeaderboardRequest, GetLeaderboardResponse, GroupDoc, ScoreDoc } from "./contract.js";
import { rankLeaderboard } from "./logic/scoring.js";
import { recomputeScore } from "./scoreStore.js";
import { requireAuth, requireString } from "./validate.js";

export const getLeaderboard = onCall<GetLeaderboardRequest>(async (request): Promise<GetLeaderboardResponse> => {
  const uid = requireAuth(request);
  const groupId = requireString(request.data?.groupId, "groupId");
  const db = getFirestore();

  const group = (await db.doc(`groups/${groupId}`).get()).data() as GroupDoc | undefined;
  // Same answer for "doesn't exist" and "not yours", so group ids can't be probed.
  if (!group || !group.members.includes(uid)) throw new HttpsError("not-found", "Group not found.");

  const snaps = await db.getAll(...group.members.map((m) => db.doc(`scores/${m}`)));
  const scores = await Promise.all(
    group.members.map((member, i) => (snaps[i].exists ? (snaps[i].data() as ScoreDoc) : recomputeScore(db, member))),
  );
  const rows = scores.map((score, i) => ({ ...score, displayName: group.memberNames[group.members[i]] ?? "Member" }));

  return {
    group: { id: groupId, name: group.name, inviteCode: group.inviteCode },
    entries: rankLeaderboard(rows, uid),
  };
});
