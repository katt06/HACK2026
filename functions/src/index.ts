import { initializeApp } from "firebase-admin/app";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import type {
  CompleteChallengeRequest,
  CompleteChallengeResponse,
  GetChallengesRequest,
  GetChallengesResponse,
  GetLeaderboardRequest,
  GetLeaderboardResponse,
  GetSafeToSaveRequest,
  GetSafeToSaveResponse,
  HealthResponse,
} from "./contract.js";
import { challengesStub, completeChallengeStub, leaderboardStub, safeToSaveStub } from "./stubs.js";
import { requireAuth, requireString } from "./validate.js";

initializeApp();

export { joinGroup } from "./groups.js";
export { refreshRecurring } from "./recurringJob.js";

export const health = onCall((): HealthResponse => {
  return { ok: true, time: new Date().toISOString() };
});

// TODO: replace stubs with real logic. Response shapes are fixed by contract.ts.

export const getSafeToSave = onCall<GetSafeToSaveRequest>((request): GetSafeToSaveResponse => {
  requireAuth(request);
  return safeToSaveStub();
});

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
