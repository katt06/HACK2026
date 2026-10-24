import { httpsCallable } from "firebase/functions";
import type { CallableName, Callables } from "@contract";
import { functions } from "../firebase";
import type { Api } from "./types";

type Req<K extends CallableName> = Callables[K]["request"];
type Res<K extends CallableName> = Callables[K]["response"];

async function call<K extends CallableName>(name: K, data: Req<K>): Promise<Res<K>> {
  const fn = httpsCallable<Req<K>, Res<K>>(functions, name);
  const result = await fn(data);
  return result.data;
}

export const realApi: Api = {
  getSafeToSave: () => call("getSafeToSave", {}),
  getChallenges: () => call("getChallenges", {}),
  completeChallenge: (challengeId) => call("completeChallenge", { challengeId }),
  getLeaderboard: (groupId) => call("getLeaderboard", { groupId }),
};
