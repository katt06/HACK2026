// The only view of a user's money the LLM ever gets: category totals vs. a typical month.
// No merchants, no individual transactions, and no essential categories (so it can't suggest cutting them).
import type { Category, Cents, ChallengeType, IsoDate } from "../contract.js";
import { addDays } from "./dates.js";
import { formatDollars } from "./money.js";
import { detectRecurring, type TransactionLike } from "./recurring.js";
import { DISCRETIONARY_CATEGORIES } from "./scoring.js";

export const SUMMARY_WINDOW_DAYS = 30;
// Flexible spending plus transport (for transit_swap). Never groceries, rent, utilities, insurance, or medical.
export const SUMMARY_CATEGORIES: readonly Category[] = [...DISCRETIONARY_CATEGORIES, "transport"];

export interface CategoryTrend {
  category: Category;
  last30Days: Cents;
  typicalMonth: Cents; // from users.baselineSpendByCategory
  changePct: number | null; // null when there's no baseline to compare with
}

export interface SpendingSummary {
  trends: CategoryTrend[]; // biggest spend first
  subscriptionCount: number;
  goalProgressPct: number | null;
  activeChallengeTypes: ChallengeType[];
}

export interface SummaryInput {
  today: IsoDate;
  transactions: (TransactionLike & { category: Category })[];
  baselineSpendByCategory: Partial<Record<Category, Cents>>;
  goalProgressPct: number | null;
  activeChallengeTypes: ChallengeType[];
}

export function buildSpendingSummary(input: SummaryInput): SpendingSummary {
  const from = addDays(input.today, -(SUMMARY_WINDOW_DAYS - 1));
  const trends: CategoryTrend[] = [];
  for (const category of SUMMARY_CATEGORIES) {
    const last30Days = input.transactions
      .filter((t) => t.category === category && t.amount > 0 && t.date >= from && t.date <= input.today)
      .reduce((s, t) => s + t.amount, 0);
    const typicalMonth = input.baselineSpendByCategory[category] ?? 0;
    if (last30Days === 0 && typicalMonth === 0) continue;
    const changePct = typicalMonth > 0 ? Math.round((100 * (last30Days - typicalMonth)) / typicalMonth) : null;
    trends.push({ category, last30Days, typicalMonth, changePct });
  }
  trends.sort((a, b) => b.last30Days - a.last30Days);
  return {
    trends,
    subscriptionCount: detectRecurring(input.transactions, input.today).filter((s) => s.category === "subscriptions").length,
    goalProgressPct: input.goalProgressPct,
    activeChallengeTypes: input.activeChallengeTypes,
  };
}

export function categoryLabel(category: Category): string {
  return { delivery: "food delivery", dining: "dining out", personal_care: "personal care" }[category as string] ?? category;
}

// "up 20% vs. a typical month", "about the same as a typical month", …
export function describeChange(changePct: number | null): string {
  if (changePct === null) return "no typical month to compare with yet";
  if (Math.abs(changePct) < 5) return "about the same as a typical month";
  return `${changePct > 0 ? "up" : "down"} ${Math.abs(changePct)}% vs. a typical month`;
}

// The summary as plain lines for the prompt, e.g. "food delivery: $340 in the last 30 days, up 20% vs. a typical month".
export function summaryToText(summary: SpendingSummary): string[] {
  const lines = summary.trends.map(
    (t) => `${categoryLabel(t.category)}: ${formatDollars(t.last30Days)} in the last ${SUMMARY_WINDOW_DAYS} days, ${describeChange(t.changePct)}`,
  );
  if (summary.subscriptionCount > 0) lines.push(`subscriptions: ${summary.subscriptionCount} recurring charges`);
  if (summary.goalProgressPct !== null) lines.push(`savings goal progress: ${summary.goalProgressPct}%`);
  if (summary.activeChallengeTypes.length > 0) lines.push(`already working on: ${summary.activeChallengeTypes.join(", ")}`);
  return lines;
}

// The flexible category that grew the most (and isn't tiny), for personalizing challenges.
export function topRisingTrend(summary: SpendingSummary, minSpend: Cents = 2000): CategoryTrend | null {
  const rising = summary.trends.filter((t) => t.changePct !== null && t.changePct > 0 && t.last30Days >= minSpend);
  return rising.sort((a, b) => b.changePct! - a.changePct!)[0] ?? null;
}
