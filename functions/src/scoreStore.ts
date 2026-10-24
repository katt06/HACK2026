import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import type { AccountDoc, ChallengeDoc, GoalDoc, GoalEntryDoc, ScoreDoc, TransactionDoc, UserDoc } from "./contract.js";
import { todayIso } from "./logic/dates.js";
import { zeroSafeToSaveDaysCounter } from "./logic/safeToSaveHistory.js";
import { computeScore } from "./logic/scoring.js";

// Loads everything the score depends on and rewrites scores/{uid}. Safe to call any time; it's idempotent.
export async function recomputeScore(db: Firestore, uid: string): Promise<ScoreDoc> {
  const [userSnap, goalsSnap, challengesSnap, accountSnap, txSnap] = await Promise.all([
    db.doc(`users/${uid}`).get(),
    db.collection("goals").where("ownerId", "==", uid).get(),
    db.collection("challenges").where("userId", "==", uid).where("status", "==", "completed").get(),
    db.doc(`accounts/${uid}`).get(),
    db.collection("transactions").where("userId", "==", uid).get(),
  ]);
  const user = userSnap.data() as UserDoc | undefined;
  const today = todayIso(new Date(), user?.settings?.timezone);
  const goals = await Promise.all(
    goalsSnap.docs.map(async (g) => ({
      goal: g.data() as GoalDoc,
      entries: (await g.ref.collection("entries").get()).docs.map((e) => e.data() as GoalEntryDoc),
    })),
  );
  const account = accountSnap.data() as AccountDoc | undefined;
  const transactions = txSnap.docs.map((d) => d.data() as TransactionDoc);

  const score = computeScore({
    userId: uid,
    today,
    goals,
    completedChallengePoints: challengesSnap.docs.map((d) => (d.data() as ChallengeDoc).points),
    baselineSpendByCategory: user?.baselineSpendByCategory ?? {},
    transactions,
    // Without account data there's no safe-to-save history, so tight weeks can't pause the streak.
    zeroSafeToSaveDays: account
      ? zeroSafeToSaveDaysCounter({ today, currentBalance: account.currentBalance, balanceAsOf: account.asOf, transactions })
      : undefined,
  });
  await db.doc(`scores/${uid}`).set(score);
  return score;
}

async function recomputeQuietly(uid: string | undefined) {
  if (!uid) return;
  try {
    await recomputeScore(getFirestore(), uid);
  } catch (err) {
    logger.error("Score recompute failed", { uid, err });
  }
}

export const onGoalWritten = onDocumentWritten("goals/{goalId}", async (event) => {
  const goal = (event.data?.after.data() ?? event.data?.before.data()) as GoalDoc | undefined;
  await recomputeQuietly(goal?.ownerId);
});

export const onGoalEntryWritten = onDocumentWritten("goals/{goalId}/entries/{entryId}", async (event) => {
  const goal = (await getFirestore().doc(`goals/${event.params.goalId}`).get()).data() as GoalDoc | undefined;
  await recomputeQuietly(goal?.ownerId);
});

export const onChallengeWritten = onDocumentWritten("challenges/{challengeId}", async (event) => {
  const challenge = (event.data?.after.data() ?? event.data?.before.data()) as ChallengeDoc | undefined;
  await recomputeQuietly(challenge?.userId);
});

// Streaks and improvement move with the calendar even when nothing is written.
export const refreshScores = onSchedule("every day 04:30", async () => {
  const users = await getFirestore().collection("users").select().get();
  for (const user of users.docs) await recomputeQuietly(user.id);
});
