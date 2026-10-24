import { initializeApp } from "firebase-admin/app";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import type {
  CompleteChallengeRequest,
  CompleteChallengeResponse,
  GetChallengesRequest,
  GetChallengesResponse,
  GetLeaderboardRequest,
  GetLeaderboardResponse,
  HealthResponse,
} from "./contract.js";
import { challengesStub, completeChallengeStub, leaderboardStub } from "./stubs.js";
import { requireAuth, requireString } from "./validate.js";

initializeApp();

export { joinGroup } from "./groups.js";
export { refreshRecurring } from "./recurringJob.js";
export { getSafeToSave } from "./safeToSave.js";

export const health = onCall((): HealthResponse => {
  return { ok: true, time: new Date().toISOString() };
});

// TODO: replace stubs with real logic. Response shapes are fixed by contract.ts.

export const getChallenges = onCall<GetChallengesRequest>((request): GetChallengesResponse => {
  const uid = requireAuth(request);
  return challengesStub(uid);
});

export const completeChallenge = onCall<CompleteChallengeRequest>((request): CompleteChallengeResponse => {
  const uid = requireAuth(request);
  const challengeId = requireString(request.data?.challengeId, "challengeId");
  const result = completeChallengeStub(uid, challengeId);
  if (!result) throw new HttpsError("not-found", "Challenge not found.");
  return result;
});

export const getLeaderboard = onCall<GetLeaderboardRequest>((request): GetLeaderboardResponse => {
  const uid = requireAuth(request);
  const groupId = requireString(request.data?.groupId, "groupId");
  return leaderboardStub(uid, groupId);
});
