import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import type { ChallengeDoc, CompleteChallengeRequest, CompleteChallengeResponse, ScoreDoc, UserDoc } from "./contract.js";
import { banditOutcome } from "./banditStore.js";
import { OPEN_STATUSES, statsDelta } from "./logic/bandit.js";
import { coinsAfterChallenge } from "./logic/scoring.js";
import { recomputeScore } from "./scoreStore.js";
import { requireAuth, requireString } from "./validate.js";

// The only way a challenge's status changes from the client side (security rules block direct writes).
export const completeChallenge = onCall<CompleteChallengeRequest>(async (request): Promise<CompleteChallengeResponse> => {
  const uid = requireAuth(request);
  const challengeId = requireString(request.data?.challengeId, "challengeId");
  const db = getFirestore();
  const ref = db.doc(`challenges/${challengeId}`);

  const levelBefore = ((await db.doc(`scores/${uid}`).get()).data() as ScoreDoc | undefined)?.level;

  const challenge = await db.runTransaction(async (tx) => {
    const current = (await tx.get(ref)).data() as ChallengeDoc | undefined;
    // Same error for "missing" and "someone else's", so ids can't be probed.
    if (!current || current.userId !== uid) throw new HttpsError("not-found", "Challenge not found.");
    if (!OPEN_STATUSES.includes(current.status)) throw new HttpsError("failed-precondition", `This challenge is already ${current.status}.`);
    const completed: ChallengeDoc = { ...current, status: "completed", completedAt: new Date().toISOString() };
    tx.update(ref, { status: completed.status, completedAt: completed.completedAt });
    const [statsRef, stats] = banditOutcome(db, uid, current, statsDelta(current.status, "complete"));
    tx.set(statsRef, stats, { merge: true });
    return completed;
  });

  // Recompute now so the response carries the new score (the challenge trigger will also do this; it's idempotent).
  const score = await recomputeScore(db, uid);

  // Coins: the transaction above lets each challenge complete only once, so this runs once per completion.
  const userRef = db.doc(`users/${uid}`);
  await db.runTransaction(async (tx) => {
    const coins = ((await tx.get(userRef)).data() as UserDoc | undefined)?.coins;
    tx.set(userRef, { coins: coinsAfterChallenge(coins, score.points, challenge.points) }, { merge: true });
  });
  return {
    challenge: { id: challengeId, ...challenge },
    pointsAwarded: challenge.points,
    score,
    leveledUp: levelBefore !== undefined && score.level > levelBefore,
  };
});
