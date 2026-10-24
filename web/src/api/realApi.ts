import { httpsCallable } from "firebase/functions";
import { addDoc, collection, getDocs, query, where } from "firebase/firestore";
import type { CallableName, Callables, GroupDoc, GroupSummary } from "@contract";
import { auth, db, functions } from "../firebase";
import { generateInviteCode } from "../lib/inviteCode";
import type { Api } from "./types";

type Req<K extends CallableName> = Callables[K]["request"];
type Res<K extends CallableName> = Callables[K]["response"];

async function call<K extends CallableName>(name: K, data: Req<K>): Promise<Res<K>> {
  const fn = httpsCallable<Req<K>, Res<K>>(functions, name);
  const result = await fn(data);
  return result.data;
}

function signedInUser() {
  if (!auth.currentUser) throw new Error("Sign in to continue.");
  return auth.currentUser;
}

function toGroupSummary(id: string, group: GroupDoc, viewerUid: string): GroupSummary {
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

export const realApi: Api = {
  getSafeToSave: () => call("getSafeToSave", {}),
  getChallenges: () => call("getChallenges", {}),
  completeChallenge: (challengeId) => call("completeChallenge", { challengeId }),
  getLeaderboard: (groupId) => call("getLeaderboard", { groupId }),

  // Groups are read and created directly in Firestore (security rules enforce the shape);
  // joining needs the Admin SDK, so it goes through a callable.
  async getMyGroups() {
    const { uid } = signedInUser();
    const snap = await getDocs(query(collection(db, "groups"), where("members", "array-contains", uid)));
    return snap.docs.map((d) => toGroupSummary(d.id, d.data() as GroupDoc, uid));
  },
  async createGroup(name) {
    const user = signedInUser();
    const group: GroupDoc = {
      name: name.trim(),
      members: [user.uid],
      memberNames: { [user.uid]: user.displayName || "Member" },
      inviteCode: generateInviteCode(),
    };
    const ref = await addDoc(collection(db, "groups"), group);
    return toGroupSummary(ref.id, group, user.uid);
  },
  joinGroup: (inviteCode) => call("joinGroup", { inviteCode }),
};
