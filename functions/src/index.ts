import { initializeApp } from "firebase-admin/app";
import { onCall } from "firebase-functions/v2/https";
import type { HealthResponse } from "./contract.js";

initializeApp();

export { getChallenges } from "./challenges.js";
export { completeChallenge } from "./completeChallenge.js";
export { joinGroup } from "./groups.js";
export { getLeaderboard } from "./leaderboard.js";
export { refreshRecurring } from "./recurringJob.js";
export { getSafeToSave } from "./safeToSave.js";
export { onChallengeWritten, onGoalEntryWritten, onGoalWritten, refreshScores } from "./scoreStore.js";
export { syncScoreViewers } from "./scoreViewers.js";

export const health = onCall((): HealthResponse => {
  return { ok: true, time: new Date().toISOString() };
});
