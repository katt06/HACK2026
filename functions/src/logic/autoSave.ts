// Auto-save: on payday, move each goal's rule amount, but never more than that day's remaining money.
// Pure functions; autoSaveStore.ts does the Firestore part.
import { AUTO_SAVE_MAX_PERCENT, type AutoSaveRule, type Cents, type GoalDoc, type IsoDate } from "../contract.js";
import { detectRecurring, seriesKey, type TransactionLike } from "./recurring.js";

export const MIN_TRANSFER: Cents = 100; // $1; smaller moves are skipped as noise
const IRREGULAR_MIN_PAYOUT: Cents = 5000; // irregular earners: any payout of $50+ counts as payday

// Returns an error message, or null if the rule is valid.
export function validateAutoSaveRule(rule: unknown): string | null {
  if (rule === null) return null;
  if (typeof rule !== "object") return "Auto-save rule must be an object or null.";
  const r = rule as Partial<AutoSaveRule> & { percent?: unknown; amount?: unknown };
  if (r.kind === "percentOfBalance") {
    const ok = Number.isInteger(r.percent) && (r.percent as number) >= 1 && (r.percent as number) <= AUTO_SAVE_MAX_PERCENT;
    return ok ? null : `Percent must be a whole number from 1 to ${AUTO_SAVE_MAX_PERCENT}.`;
  }
  if (r.kind === "fixed") {
    return Number.isInteger(r.amount) && (r.amount as number) >= MIN_TRANSFER ? null : "Amount must be at least $1.";
  }
  return 'Auto-save kind must be "percentOfBalance" or "fixed".';
}

// Payday = a recurring paycheck landed today; with no recurring paycheck, any payout of $50+ today.
export function isPaydayToday(transactions: TransactionLike[], today: IsoDate): boolean {
  const inflowsToday = transactions.filter((t) => t.date === today && t.amount < 0);
  if (inflowsToday.length === 0) return false;
  const paydayKeys = new Set(
    detectRecurring(transactions, today)
      .filter((s) => s.isPayday)
      .map((s) => s.key),
  );
  if (paydayKeys.size > 0) return inflowsToday.some((t) => paydayKeys.has(seriesKey(t)));
  return inflowsToday.some((t) => -t.amount >= IRREGULAR_MIN_PAYOUT);
}

export function ruleAmount(rule: AutoSaveRule, balance: Cents): Cents {
  return rule.kind === "fixed" ? rule.amount : Math.floor((balance * rule.percent) / 100);
}

export interface AutoSaveGoal {
  id: string;
  goal: Pick<GoalDoc, "targetAmount" | "currentAmount" | "autoSave" | "autoSaveLastRunOn" | "createdAt">;
}

export interface PlannedAutoSave {
  goalId: string;
  wanted: Cents; // what the rule asked for
  amount: Cents; // what will actually move (0 = skipped)
  reason: "saved" | "capped" | "skipped";
  note: string; // goes on the goal entry / shown to the user
}

// Oldest goal first. Each move comes out of the same remaining money and balance, so two rules can't
// together overshoot the cap. Goals already run today, reached, or without a rule are left out.
export function planAutoSaves(goals: AutoSaveGoal[], balance: Cents, remainingMoney: Cents, today: IsoDate): PlannedAutoSave[] {
  let room = Math.min(remainingMoney, balance);
  const plans: PlannedAutoSave[] = [];
  for (const { id, goal } of [...goals].sort((a, b) => a.goal.createdAt.localeCompare(b.goal.createdAt))) {
    if (!goal.autoSave || goal.autoSaveLastRunOn === today) continue;
    const toTarget = goal.targetAmount - goal.currentAmount;
    if (toTarget <= 0) continue;
    const wanted = ruleAmount(goal.autoSave, balance);
    const amount = Math.min(wanted, room, toTarget);
    if (amount < MIN_TRANSFER) {
      plans.push({ goalId: id, wanted, amount: 0, reason: "skipped", note: "Auto-save skipped: no remaining money this payday." });
      continue;
    }
    room -= amount;
    const note =
      amount === toTarget
        ? "Auto-save on payday: goal reached!"
        : amount < wanted
          ? "Auto-save on payday (capped at your remaining money)"
          : "Auto-save on payday";
    plans.push({ goalId: id, wanted, amount, reason: amount < wanted && amount !== toTarget ? "capped" : "saved", note });
  }
  return plans;
}
