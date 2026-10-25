import { describe, expect, it } from "vitest";
import type { ContributionEntry, ExpenseEntry, GoalEntryDoc, ScoreDoc } from "../contract.js";
import { addDays } from "./dates.js";
import { balanceOn, safeToSaveHistory, safeToSaveOn, zeroSafeToSaveDaysCounter } from "./safeToSaveHistory.js";
import {
  blendedScore,
  coinsAfterChallenge,
  computeScore,
  goalProgressPct,
  improvementScore,
  levelFor,
  progressPoints,
  rankLeaderboard,
  startOfWeek,
  weeklyStreak,
  weeklyTarget,
  type GoalForScoring,
  type GoalWithEntries,
} from "./scoring.js";

const TODAY = "2026-10-24"; // Saturday
const THIS_WEEK = "2026-10-19"; // Monday
const weekStart = (weeksAgo: number) => addDays(THIS_WEEK, -7 * weeksAgo);

const contribution = (date: string, amount: number, verified = false): ContributionEntry => ({
  kind: "contribution",
  amount,
  verified,
  note: "",
  createdAt: `${date}T12:00:00.000Z`,
});

function goal(entries: GoalEntryDoc[], overrides: Partial<GoalForScoring> = {}): GoalWithEntries {
  const saved = entries.reduce((s, e) => s + (e.kind === "contribution" ? e.amount : 0), 0);
  return {
    goal: {
      targetAmount: 100000,
      currentAmount: saved,
      deadline: "2027-10-18", // a year out, so $50/week is comfortably on pace
      pausedUntil: null,
      verified: false,
      createdAt: "2026-06-01T12:00:00.000Z",
      ...overrides,
    },
    entries,
  };
}

// $50 on the Wednesday of each listed week (0 = this week).
const weekly = (weeksAgo: number[], amount = 5000) => weeksAgo.map((w) => contribution(addDays(weekStart(w), 2), amount));

describe("startOfWeek", () => {
  it("returns the Monday", () => {
    expect(startOfWeek("2026-10-24")).toBe("2026-10-19");
    expect(startOfWeek("2026-10-19")).toBe("2026-10-19");
    expect(startOfWeek("2026-10-25")).toBe("2026-10-19"); // Sunday belongs to the week before
  });
});

describe("weeklyTarget", () => {
  it("is (target - saved at week start) / weeks left, frozen at week start", () => {
    // $350 saved before Monday plus $50 on Tuesday; 10 weeks to the deadline → ($1000 - $350) / 10
    const g = goal([contribution("2026-09-01", 35000), contribution("2026-10-20", 5000)], { deadline: "2026-12-28" });
    expect(weeklyTarget([g], THIS_WEEK, TODAY)).toEqual({ target: 6500, activeGoals: 1 });
  });

  it("sums active goals and skips new, paused, reached, and overdue ones", () => {
    const active = goal([contribution("2026-09-01", 35000)], { deadline: "2026-12-28" });
    const createdThisWeek = goal([], { createdAt: "2026-10-21T09:00:00.000Z", deadline: "2026-12-28" });
    const paused = goal([], { pausedUntil: "2026-11-01" });
    const reached = goal([contribution("2026-09-01", 100000)]);
    const overdue = goal([], { deadline: "2026-10-01" });
    expect(weeklyTarget([active, createdThisWeek, paused, reached, overdue], THIS_WEEK, TODAY)).toEqual({ target: 6500, activeGoals: 1 });
    // The new goal joins next week.
    expect(weeklyTarget([createdThisWeek], addDays(THIS_WEEK, 7), "2026-10-27").activeGoals).toBe(1);
  });
});

describe("weeklyStreak", () => {
  it("counts consecutive on-pace weeks, including this one once it's met", () => {
    expect(weeklyStreak([goal(weekly([0, 1, 2, 3, 5, 6]))], TODAY)).toBe(4);
  });

  it("doesn't break on a this week that isn't done yet", () => {
    expect(weeklyStreak([goal(weekly([1, 2, 3, 5]))], TODAY)).toBe(3);
  });

  it("counts contributions to any goal against the combined target", () => {
    const a = goal(weekly([0, 1], 3000));
    const b = goal(weekly([0, 1], 3000));
    expect(weeklyStreak([a, b], TODAY)).toBe(2);
    expect(weeklyStreak([a, goal([])], TODAY)).toBe(0); // a second, empty goal raises the target above $30
  });

  it("pauses a missed week when safe-to-save was $0 on more than 4 days", () => {
    const g = goal(weekly([0, 1, 2, 3, 5, 6]));
    const tightWeek = (ws: string) => (ws === weekStart(4) ? 5 : 0);
    expect(weeklyStreak([g], TODAY, tightWeek)).toBe(6);
    expect(weeklyStreak([g], TODAY, (ws) => (ws === weekStart(4) ? 4 : 0))).toBe(4); // exactly 4 isn't enough
  });

  it("still counts a met week even when money was tight", () => {
    expect(weeklyStreak([goal(weekly([0, 1]))], TODAY, () => 7)).toBe(2);
  });

  it("pauses weeks with no active goals, using pause entries for past pauses", () => {
    // Paused for 2 weeks starting the Monday of week 3, so weeks 3 and 2 are paused; weeks 1, 0 and 4 count.
    const pause: ExpenseEntry = { kind: "expense", amount: 20000, choice: "pause", weeksLater: 2, note: "", createdAt: `${weekStart(3)}T09:00:00.000Z` };
    const g = goal([...weekly([0, 1, 4]), pause], { pausedUntil: weekStart(1) });
    expect(weeklyStreak([g], TODAY)).toBe(3);
  });

  it("applies a pause with no entry from this week on, not to the past", () => {
    const g = goal(weekly([1, 2]), { pausedUntil: "2026-11-02" });
    expect(weeklyStreak([g], TODAY)).toBe(2); // this week paused, weeks 1–2 still count
  });

  it("pauses this week when the only goal was created mid-week", () => {
    const g = goal([contribution("2026-10-22", 5000)], { createdAt: "2026-10-21T09:00:00.000Z" });
    expect(weeklyStreak([g], TODAY)).toBe(0);
    expect(weeklyStreak([g], "2026-10-29")).toBe(0); // next week: active, nothing saved yet, so pending
  });

  it("stops at the week the first goal was created and is 0 with no goals", () => {
    const g = goal(weekly([0, 1, 2]), { createdAt: `${addDays(weekStart(2), -1)}T12:00:00.000Z` });
    expect(weeklyStreak([g], TODAY, () => 7)).toBe(3);
    expect(weeklyStreak([], TODAY)).toBe(0);
  });
});

describe("improvementScore", () => {
  const txs = [
    { merchant: "TACO LOCO", amount: 15000, date: "2026-10-10", category: "dining" as const },
    { merchant: "UBER EATS", amount: 10000, date: "2026-10-20", category: "delivery" as const },
    { merchant: "SAFEWAY", amount: 90000, date: "2026-10-20", category: "groceries" as const },
    { merchant: "UBER EATS", amount: 99999, date: "2026-09-01", category: "delivery" as const }, // outside 30 days
  ];

  it("is the % drop in discretionary spend vs. baseline, ignoring essentials", () => {
    expect(improvementScore({ dining: 30000, delivery: 20000, groceries: 50000 }, txs, TODAY)).toBe(50);
  });

  it("clamps to 0–100 and is 0 without a baseline", () => {
    expect(improvementScore({ dining: 10000 }, txs, TODAY)).toBe(0);
    expect(improvementScore({ dining: 30000, delivery: 20000 }, [], TODAY)).toBe(100);
    expect(improvementScore({}, txs, TODAY)).toBe(0);
  });
});

describe("progress, points and level", () => {
  it("goalProgressPct is saved / target across goals, capped at 100", () => {
    expect(goalProgressPct([goal([contribution("2026-09-01", 42000)])])).toBe(42);
    expect(goalProgressPct([goal([contribution("2026-09-01", 150000)])])).toBe(100);
    expect(goalProgressPct([])).toBe(0);
  });

  it("weights verified progress 1.5×", () => {
    expect(progressPoints([goal([contribution("2026-09-01", 40000)])])).toBe(40);
    expect(progressPoints([goal([contribution("2026-09-01", 20000), contribution("2026-09-02", 20000, true)])])).toBe(50);
    expect(progressPoints([goal([contribution("2026-09-01", 40000)], { verified: true })])).toBe(60);
  });

  it("can't be farmed by splitting savings across many goals", () => {
    const one = progressPoints([goal([contribution("2026-09-01", 40000)])]);
    const many = progressPoints([1, 2, 3, 4].map(() => goal([contribution("2026-09-01", 10000)], { targetAmount: 25000 })));
    expect(many).toBe(one);
  });

  it("levels up every 100 points", () => {
    expect([0, 99, 100, 299, 300].map(levelFor)).toEqual([1, 1, 2, 3, 4]);
  });

  it("computeScore combines challenges and progress and has no dollar fields", () => {
    const score = computeScore({
      userId: "u1",
      today: TODAY,
      goals: [goal(weekly([0, 1, 2]))],
      completedChallengePoints: [30, 50, 80],
      baselineSpendByCategory: {},
      transactions: [],
    });
    expect(score).toEqual({ userId: "u1", goalProgressPct: 15, streak: 3, improvementScore: 0, points: 175, level: 2, badges: ["first-float"] });
  });

  it("awards badges from the stats and keeps ones earned before", () => {
    const base = { userId: "u1", today: TODAY, goals: [], baselineSpendByCategory: {}, transactions: [] };
    expect(computeScore({ ...base, completedChallengePoints: Array(10).fill(30) }).badges).toEqual(["yuzu-master"]);
    expect(computeScore({ ...base, completedChallengePoints: [], previousBadges: ["chill-streak"] }).badges).toEqual(["chill-streak"]);
    expect(computeScore({ ...base, completedChallengePoints: [] }).badges).toEqual([]);
  });
});

describe("coinsAfterChallenge", () => {
  it("adds the challenge's points", () => {
    expect(coinsAfterChallenge(120, 400, 50)).toBe(170);
  });

  it("starts untracked users with all their XP", () => {
    expect(coinsAfterChallenge(undefined, 330, 30)).toBe(330);
  });
});

describe("rankLeaderboard", () => {
  const row = (userId: string, displayName: string, s: Partial<ScoreDoc>) => ({
    userId,
    displayName,
    goalProgressPct: 0,
    streak: 0,
    improvementScore: 0,
    points: 0,
    level: 1,
    ...s,
  });

  it("ranks by blended score and marks the viewer", () => {
    const rows = [row("a", "Ana", { points: 300 }), row("b", "Ben", { points: 250, streak: 6 }), row("c", "Cy", { points: 280, improvementScore: 25 })];
    expect(blendedScore(rows[1])).toBe(310);
    const entries = rankLeaderboard(rows, "c");
    expect(entries.map((e) => [e.userId, e.rank, e.isMe])).toEqual([["b", 1, false], ["c", 2, true], ["a", 3, false]]);
  });

  it("never exposes anything beyond the score fields", () => {
    const leaky = { ...row("a", "Ana", {}), currentBalance: 123400 } as ScoreDoc & { displayName: string };
    const allowed = ["userId", "displayName", "rank", "isMe", "goalProgressPct", "streak", "improvementScore", "points", "level"];
    expect(Object.keys(rankLeaderboard([leaky], "a")[0]).sort()).toEqual(allowed.sort());
  });
});

describe("safe-to-save history", () => {
  const txs = [
    { merchant: "PAYROLL", amount: -200000, date: "2026-10-16" },
    { merchant: "TACO LOCO", amount: 5000, date: "2026-10-23" },
  ];

  it("rebuilds past balances by undoing later transactions", () => {
    const input = { today: TODAY, currentBalance: 100000, balanceAsOf: TODAY, transactions: txs };
    expect(balanceOn(TODAY, input)).toBe(100000);
    expect(balanceOn("2026-10-22", input)).toBe(105000);
    expect(balanceOn("2026-10-15", input)).toBe(-95000);
  });

  it("counts $0 days in a week, up to today", () => {
    const broke = zeroSafeToSaveDaysCounter({ today: TODAY, currentBalance: 0, balanceAsOf: TODAY, transactions: [] });
    expect(broke(weekStart(1))).toBe(7);
    expect(broke(THIS_WEEK)).toBe(6); // Mon–Sat
    const flush = zeroSafeToSaveDaysCounter({ today: TODAY, currentBalance: 10_000_000, balanceAsOf: TODAY, transactions: [] });
    expect(flush(THIS_WEEK)).toBe(0);
  });
});

describe("safeToSaveHistory", () => {
  it("has one point per day ending today, with balances rebuilt from transactions", () => {
    const input = {
      today: TODAY,
      currentBalance: 100_000,
      balanceAsOf: TODAY,
      transactions: [{ amount: 20_000, date: TODAY, merchant: "Rent", category: "rent" as const }],
    };
    const history = safeToSaveHistory(input, 3);
    expect(history.map((p) => p.date)).toEqual([addDays(TODAY, -2), addDays(TODAY, -1), TODAY]);
    expect(history.map((p) => p.balance)).toEqual([120_000, 120_000, 100_000]);
    expect(history[2].amount).toBe(safeToSaveOn(TODAY, input));
  });
});
