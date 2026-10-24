// Scores shown to group members: progress, weekly saving streak, spending improvement, points, level.
// Pure functions. Scores never contain dollar amounts.
import type { Category, Cents, ContributionEntry, ExpenseEntry, GoalDoc, GoalEntryDoc, IsoDate, LeaderboardEntry, ScoreDoc } from "../contract.js";
import { addDays, dayOfWeek, daysBetween } from "./dates.js";
import type { TransactionLike } from "./recurring.js";

// Flexible spending a user can choose to cut; never essentials (groceries, rent, utilities, insurance, medical).
export const DISCRETIONARY_CATEGORIES: readonly Category[] = [
  "dining",
  "delivery",
  "coffee",
  "shopping",
  "entertainment",
  "subscriptions",
  "travel",
  "personal_care",
];
export const IMPROVEMENT_WINDOW_DAYS = 30;
export const PROGRESS_POINTS = 100; // a fully funded (unverified) goal is worth one level
export const VERIFIED_WEIGHT = 1.5;
export const POINTS_PER_LEVEL = 100;
export const STREAK_BLEND_WEIGHT = 10;
export const MAX_ZERO_DAYS_BEFORE_PAUSE = 4; // more than this many $0 safe-to-save days pauses a missed week
const MAX_STREAK_WEEKS = 104;

export type GoalForScoring = Pick<GoalDoc, "targetAmount" | "currentAmount" | "deadline" | "pausedUntil" | "verified" | "createdAt">;

export interface GoalWithEntries {
  goal: GoalForScoring;
  entries: GoalEntryDoc[];
}

const contributions = (entries: GoalEntryDoc[]) => entries.filter((e): e is ContributionEntry => e.kind === "contribution");
const dateOf = (isoDateTime: string): IsoDate => isoDateTime.slice(0, 10);

// ---------- Progress ----------

export function goalProgressPct(goals: GoalWithEntries[]): number {
  const target = goals.reduce((s, g) => s + g.goal.targetAmount, 0);
  if (target <= 0) return 0;
  const saved = goals.reduce((s, g) => s + Math.min(g.goal.currentAmount, g.goal.targetAmount), 0);
  return Math.min(100, Math.round((100 * saved) / target));
}

// ---------- Weekly streak ----------

// Monday of the week containing date.
export function startOfWeek(date: IsoDate): IsoDate {
  return addDays(date, -((dayOfWeek(date) + 6) % 7));
}

// A goal only stores its current pausedUntil, so past pauses come from the "pause" flex entries:
// each one covers [its date, its date + weeksLater weeks). The current pausedUntil extends the latest
// pause (pauses can stack). With no pause entries, the pause only applies from this week on.
export function isPausedAt({ goal, entries }: GoalWithEntries, weekStart: IsoDate, today: IsoDate): boolean {
  const pauses = entries.filter((e): e is ExpenseEntry => e.kind === "expense" && e.choice === "pause");
  if (pauses.some((p) => dateOf(p.createdAt) <= weekStart && weekStart < addDays(dateOf(p.createdAt), 7 * p.weeksLater))) return true;
  if (goal.pausedUntil === null || goal.pausedUntil <= weekStart) return false;
  const pauseStarted = pauses.length > 0 ? pauses.map((p) => dateOf(p.createdAt)).sort().at(-1)! : startOfWeek(today);
  return weekStart >= pauseStarted;
}

// What the user needed to save this week, frozen at week start. Goals join the week after they're created,
// and paused, reached, or past-deadline goals don't count.
export function weeklyTarget(goals: GoalWithEntries[], weekStart: IsoDate, today: IsoDate): { target: Cents; activeGoals: number } {
  let target = 0;
  let activeGoals = 0;
  for (const g of goals) {
    const { goal, entries } = g;
    if (dateOf(goal.createdAt) >= weekStart) continue;
    if (isPausedAt(g, weekStart, today)) continue;
    const savedSince = contributions(entries)
      .filter((c) => dateOf(c.createdAt) >= weekStart)
      .reduce((s, c) => s + c.amount, 0);
    const remaining = goal.targetAmount - Math.max(0, goal.currentAmount - savedSince);
    const days = daysBetween(weekStart, goal.deadline);
    if (remaining <= 0 || days <= 0) continue;
    target += Math.ceil(remaining / Math.max(1, days / 7)); // same pace as the web's goalPlan
    activeGoals++;
  }
  return { target, activeGoals };
}

export function contributedBetween(goals: GoalWithEntries[], from: IsoDate, to: IsoDate): Cents {
  return goals
    .flatMap((g) => contributions(g.entries))
    .filter((c) => dateOf(c.createdAt) >= from && dateOf(c.createdAt) <= to)
    .reduce((s, c) => s + c.amount, 0);
}

export type WeekResult = "met" | "paused" | "missed";

// zeroSafeToSaveDays(weekStart) = days that week (up to today) when safe-to-save was $0.
// Only consulted for missed weeks: hitting the target counts even when money was tight.
export function weekResult(
  goals: GoalWithEntries[],
  weekStart: IsoDate,
  today: IsoDate,
  zeroSafeToSaveDays: (weekStart: IsoDate) => number,
): WeekResult {
  const { target, activeGoals } = weeklyTarget(goals, weekStart, today);
  if (activeGoals === 0) return "paused";
  const weekEnd = addDays(weekStart, 6) < today ? addDays(weekStart, 6) : today;
  if (contributedBetween(goals, weekStart, weekEnd) >= target) return "met";
  if (zeroSafeToSaveDays(weekStart) > MAX_ZERO_DAYS_BEFORE_PAUSE) return "paused";
  return "missed";
}

// Counts met weeks back from this week; paused weeks are skipped, the first missed week ends it.
// This week can only add to the streak: missing so far just means it isn't over yet.
export function weeklyStreak(goals: GoalWithEntries[], today: IsoDate, zeroSafeToSaveDays: (weekStart: IsoDate) => number = () => 0): number {
  if (goals.length === 0) return 0;
  const firstWeek = startOfWeek(goals.map((g) => dateOf(g.goal.createdAt)).sort()[0]);
  const thisWeek = startOfWeek(today);
  let streak = 0;
  for (let week = thisWeek, n = 0; week >= firstWeek && n < MAX_STREAK_WEEKS; week = addDays(week, -7), n++) {
    const result = weekResult(goals, week, today, zeroSafeToSaveDays);
    if (result === "met") streak++;
    else if (result === "missed" && week !== thisWeek) break;
  }
  return streak;
}

// ---------- Improvement ----------

// % drop in discretionary spend over the last 30 days vs. the user's typical month, clamped to 0–100.
export function improvementScore(
  baseline: Partial<Record<Category, Cents>>,
  transactions: (TransactionLike & { category: Category })[],
  today: IsoDate,
): number {
  const discretionary = new Set<Category>(DISCRETIONARY_CATEGORIES);
  const typical = DISCRETIONARY_CATEGORIES.reduce((s, c) => s + (baseline[c] ?? 0), 0);
  if (typical <= 0) return 0;
  const from = addDays(today, -(IMPROVEMENT_WINDOW_DAYS - 1));
  const recent = transactions
    .filter((t) => t.amount > 0 && discretionary.has(t.category) && t.date >= from && t.date <= today)
    .reduce((s, t) => s + t.amount, 0);
  return Math.min(100, Math.max(0, Math.round((100 * (typical - recent)) / typical)));
}

// ---------- Points and level ----------

// Up to 100 points for funding goals, with verified money counting 1.5×. Uses the share of all targets,
// so splitting savings across many small goals doesn't earn more.
export function progressPoints(goals: GoalWithEntries[]): number {
  const target = goals.reduce((s, g) => s + g.goal.targetAmount, 0);
  if (target <= 0) return 0;
  const weighted = goals.reduce((s, { goal, entries }) => {
    const saved = Math.max(0, Math.min(goal.currentAmount, goal.targetAmount));
    const verifiedContributions = contributions(entries)
      .filter((c) => c.verified)
      .reduce((v, c) => v + c.amount, 0);
    const verified = goal.verified ? saved : Math.min(saved, verifiedContributions);
    return s + (saved - verified) + VERIFIED_WEIGHT * verified;
  }, 0);
  return Math.round((PROGRESS_POINTS * weighted) / target);
}

export function levelFor(points: number): number {
  return Math.floor(points / POINTS_PER_LEVEL) + 1;
}

// ---------- Putting it together ----------

export interface ScoreInput {
  userId: string;
  today: IsoDate;
  goals: GoalWithEntries[];
  completedChallengePoints: number[];
  baselineSpendByCategory: Partial<Record<Category, Cents>>;
  transactions: (TransactionLike & { category: Category })[];
  zeroSafeToSaveDays?: (weekStart: IsoDate) => number;
}

export function computeScore(input: ScoreInput): ScoreDoc {
  const points = input.completedChallengePoints.reduce((s, p) => s + p, 0) + progressPoints(input.goals);
  return {
    userId: input.userId,
    goalProgressPct: goalProgressPct(input.goals),
    streak: weeklyStreak(input.goals, input.today, input.zeroSafeToSaveDays),
    improvementScore: improvementScore(input.baselineSpendByCategory, input.transactions, input.today),
    points,
    level: levelFor(points),
  };
}

// Points reward effort over time; improvement and streak keep it fair for people who started later.
export function blendedScore(score: Pick<ScoreDoc, "points" | "improvementScore" | "streak">): number {
  return score.points + score.improvementScore + STREAK_BLEND_WEIGHT * score.streak;
}

// Ranks by blended score (ties: points, then name). Builds entries field by field so nothing extra leaks.
export function rankLeaderboard(rows: (ScoreDoc & { displayName: string })[], viewerUid: string): LeaderboardEntry[] {
  return [...rows]
    .sort((a, b) => blendedScore(b) - blendedScore(a) || b.points - a.points || a.displayName.localeCompare(b.displayName))
    .map((r, i) => ({
      userId: r.userId,
      displayName: r.displayName,
      rank: i + 1,
      isMe: r.userId === viewerUid,
      goalProgressPct: r.goalProgressPct,
      streak: r.streak,
      improvementScore: r.improvementScore,
      points: r.points,
      level: r.level,
    }));
}
