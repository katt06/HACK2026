import type { Firestore } from "firebase-admin/firestore";
import type { AccountDoc, ContributionEntry, GoalDoc, IsoDate, TransactionDoc, UserDoc } from "./contract.js";
import { isPaydayToday, planAutoSaves, type PlannedAutoSave } from "./logic/autoSave.js";
import { todayIso } from "./logic/dates.js";
import { forecastSafeToSave } from "./logic/forecast.js";
import { debitForSavings } from "./savingsTransfer.js";

// Runs one user's auto-saves if today is their payday. Returns what was planned (empty when not payday).
// Safe to call repeatedly: each goal runs at most once per day.
export async function runAutoSavesForUser(db: Firestore, uid: string, today?: IsoDate): Promise<PlannedAutoSave[]> {
  const user = (await db.doc(`users/${uid}`).get()).data() as UserDoc | undefined;
  const day = today ?? todayIso(new Date(), user?.settings?.timezone);
  const [goalsSnap, accountSnap, txSnap] = await Promise.all([
    db.collection("goals").where("ownerId", "==", uid).get(),
    db.doc(`accounts/${uid}`).get(),
    db.collection("transactions").where("userId", "==", uid).get(),
  ]);
  const account = accountSnap.data() as AccountDoc | undefined;
  const goals = goalsSnap.docs.map((d) => ({ id: d.id, goal: d.data() as GoalDoc })).filter((g) => g.goal.autoSave);
  const transactions = txSnap.docs.map((d) => d.data() as TransactionDoc);
  if (!account || goals.length === 0 || !isPaydayToday(transactions, day)) return [];

  const remaining = forecastSafeToSave({ today: day, currentBalance: account.currentBalance, transactions }).amount;
  const plans = planAutoSaves(goals, account.currentBalance, remaining, day);

  for (const plan of plans) {
    const goalRef = db.doc(`goals/${plan.goalId}`);
    await db.runTransaction(async (tx) => {
      const [goalSnap, acctSnap] = await Promise.all([tx.get(goalRef), tx.get(db.doc(`accounts/${uid}`))]);
      const goal = goalSnap.data() as GoalDoc | undefined;
      const current = acctSnap.data() as AccountDoc | undefined;
      if (!goal || !current || goal.autoSaveLastRunOn === day) return; // another run got here first
      if (plan.amount > 0 && plan.amount <= current.currentBalance) {
        debitForSavings(tx, db, uid, current, plan.amount, day);
        const entry: ContributionEntry = { kind: "contribution", amount: plan.amount, verified: true, note: plan.note, createdAt: new Date().toISOString() };
        tx.set(goalRef.collection("entries").doc(), entry);
        tx.update(goalRef, { currentAmount: goal.currentAmount + plan.amount, autoSaveLastRunOn: day });
      } else {
        tx.update(goalRef, { autoSaveLastRunOn: day });
      }
    });
  }
  return plans;
}
