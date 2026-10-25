import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions";
import type {
  AccountDoc,
  AddToGoalRequest,
  AddToGoalResponse,
  AutoSaveRule,
  ContributionEntry,
  GoalDoc,
  SetAutoSaveRequest,
  SetAutoSaveResponse,
  UserDoc,
} from "./contract.js";
import { runAutoSavesForUser } from "./autoSaveStore.js";
import { validateAutoSaveRule } from "./logic/autoSave.js";
import { todayIso } from "./logic/dates.js";
import { formatCents } from "./logic/money.js";
import { debitForSavings } from "./savingsTransfer.js";
import { requireAuth, requireString } from "./validate.js";

// Move money from the tracked checking balance into one of the caller's goals.
export const addToGoal = onCall<AddToGoalRequest>(async (request): Promise<AddToGoalResponse> => {
  const uid = requireAuth(request);
  const goalId = requireString(request.data?.goalId, "goalId");
  const amount = request.data?.amount;
  if (!Number.isInteger(amount) || amount <= 0) throw new HttpsError("invalid-argument", "amount must be a positive whole number of cents.");
  const db = getFirestore();
  const user = (await db.doc(`users/${uid}`).get()).data() as UserDoc | undefined;
  const today = todayIso(new Date(), user?.settings?.timezone);
  const goalRef = db.doc(`goals/${goalId}`);

  return db.runTransaction(async (tx) => {
    const [goalSnap, accountSnap] = await Promise.all([tx.get(goalRef), tx.get(db.doc(`accounts/${uid}`))]);
    const goal = goalSnap.data() as GoalDoc | undefined;
    if (!goal || goal.ownerId !== uid) throw new HttpsError("not-found", "Goal not found.");
    const account = accountSnap.data() as AccountDoc | undefined;
    if (!account) throw new HttpsError("failed-precondition", "Connect a checking account first.");
    if (amount > account.currentBalance) {
      throw new HttpsError("failed-precondition", `You have ${formatCents(account.currentBalance)} in checking.`);
    }
    const toTarget = goal.targetAmount - goal.currentAmount;
    if (amount > toTarget) {
      throw new HttpsError("failed-precondition", `Only ${formatCents(Math.max(0, toTarget))} is left to reach this goal.`);
    }

    const newBalance = debitForSavings(tx, db, uid, account, amount, today);
    // Verified: the server moved it from the tracked balance itself, so it counts 1.5× toward points.
    const entry: ContributionEntry = { kind: "contribution", amount, verified: true, note: "Added from checking", createdAt: new Date().toISOString() };
    tx.set(goalRef.collection("entries").doc(), entry);
    const updated: GoalDoc = { ...goal, currentAmount: goal.currentAmount + amount };
    tx.update(goalRef, { currentAmount: updated.currentAmount });
    return { goal: { id: goalId, ...updated }, entry, newBalance };
  });
});

export const setAutoSave = onCall<SetAutoSaveRequest>(async (request): Promise<SetAutoSaveResponse> => {
  const uid = requireAuth(request);
  const goalId = requireString(request.data?.goalId, "goalId");
  const rule = (request.data?.rule ?? null) as AutoSaveRule | null;
  const problem = validateAutoSaveRule(rule);
  if (problem) throw new HttpsError("invalid-argument", problem);
  // Store only the known fields, so nothing extra rides along on the goal.
  const clean: AutoSaveRule | null =
    rule === null ? null : rule.kind === "fixed" ? { kind: "fixed", amount: rule.amount } : { kind: "percentOfBalance", percent: rule.percent };

  const db = getFirestore();
  const goalRef = db.doc(`goals/${goalId}`);
  return db.runTransaction(async (tx) => {
    const goal = (await tx.get(goalRef)).data() as GoalDoc | undefined;
    if (!goal || goal.ownerId !== uid) throw new HttpsError("not-found", "Goal not found.");
    tx.update(goalRef, { autoSave: clean });
    return { goal: { id: goalId, ...goal, autoSave: clean } };
  });
});

// Checks every auto-save owner each morning; runAutoSavesForUser does nothing unless it's their payday.
export const runAutoSaves = onSchedule("every day 07:00", async () => {
  const db = getFirestore();
  const goals = await db.collection("goals").where("autoSave", "!=", null).get();
  const owners = new Set(goals.docs.map((d) => (d.data() as GoalDoc).ownerId));
  for (const uid of owners) {
    try {
      await runAutoSavesForUser(db, uid);
    } catch (err) {
      logger.error("Auto-save failed", { uid, err });
    }
  }
});
