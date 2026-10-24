import { initializeApp } from "firebase-admin/app";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import type {
  CompleteChallengeRequest,
  CompleteChallengeResponse,
  GetChallengesRequest,
  GetChallengesResponse,
  HealthResponse,
} from "./contract.js";
import { challengesStub, completeChallengeStub } from "./stubs.js";
import { requireAuth, requireString } from "./validate.js";

initializeApp();

export { joinGroup } from "./groups.js";
export { refreshRecurring } from "./recurringJob.js";
export { getLeaderboard } from "./leaderboard.js";
export { getSafeToSave } from "./safeToSave.js";
export { onChallengeWritten, onGoalEntryWritten, onGoalWritten, refreshScores } from "./scoreStore.js";
export { syncScoreViewers } from "./scoreViewers.js";

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
