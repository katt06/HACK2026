import { httpsCallable } from "firebase/functions";
import type { CallableName, Callables } from "@contract";
import { functions } from "./firebase";

type Req<K extends CallableName> = Callables[K]["request"];
type Res<K extends CallableName> = Callables[K]["response"];

async function call<K extends CallableName>(name: K, data: Req<K>): Promise<Res<K>> {
  const fn = httpsCallable<Req<K>, Res<K>>(functions, name);
  const result = await fn(data);
  return result.data;
}

export const api = {
  getSafeToSave: () => call("getSafeToSave", {}),
  getChallenges: () => call("getChallenges", {}),
  completeChallenge: (challengeId: string) => call("completeChallenge", { challengeId }),
  getLeaderboard: (groupId: string) => call("getLeaderboard", { groupId }),
};
