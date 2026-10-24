import type { Cents, FlexChoice, GoalDoc, IsoDate } from "@contract";
import { addDays, daysBetween } from "./dates";

type GoalTiming = Pick<GoalDoc, "targetAmount" | "currentAmount" | "deadline" | "pausedUntil">;

export type GoalPlan =
  | { status: "reached" }
  | { status: "overdue"; remaining: Cents }
  | { status: "onTrack"; remaining: Cents; weeklyPace: Cents; weeksLeft: number; startsOn: IsoDate; paused: boolean };

export function progressPct(goal: Pick<GoalDoc, "targetAmount" | "currentAmount">): number {
  return goal.targetAmount > 0 ? Math.min(100, Math.round((goal.currentAmount / goal.targetAmount) * 100)) : 0;
}

// Weekly pace needed to hit the deadline, starting today (or when a pause ends).
export function goalPlan(goal: GoalTiming, today: IsoDate): GoalPlan {
  const remaining = goal.targetAmount - goal.currentAmount;
  if (remaining <= 0) return { status: "reached" };
  const paused = goal.pausedUntil !== null && goal.pausedUntil > today;
  const startsOn = paused ? goal.pausedUntil! : today;
  const days = daysBetween(startsOn, goal.deadline);
  if (days <= 0) return { status: "overdue", remaining };
  const weeksLeft = Math.max(1, days / 7);
  return { status: "onTrack", remaining, weeklyPace: Math.ceil(remaining / weeksLeft), weeksLeft, startsOn, paused };
}

export interface FlexOption {
  choice: FlexChoice;
  weeklyPace: Cents; // pace after the change (after the pause, for "pause")
  newDeadline: IsoDate;
  pausedUntil: IsoDate | null;
  weeksLater: number; // how far the deadline moves
}

// Two ways to absorb an unexpected expense without touching the goal balance.
// Returns null when there's no active plan to flex (goal reached or overdue).
export function flexOptions(goal: GoalTiming, expense: Cents, today: IsoDate): { pause: FlexOption; lowerPace: FlexOption } | null {
  const plan = goalPlan(goal, today);
  if (plan.status !== "onTrack" || expense <= 0) return null;
  const { weeklyPace, weeksLeft, startsOn, remaining } = plan;

  // Pause: skip enough weeks to cover the expense, then resume at the same pace.
  const pauseWeeks = Math.ceil(expense / weeklyPace);
  const pause: FlexOption = {
    choice: "pause",
    weeklyPace,
    newDeadline: addDays(goal.deadline, pauseWeeks * 7),
    pausedUntil: addDays(startsOn, pauseWeeks * 7),
    weeksLater: pauseWeeks,
  };

  // Lower pace: free up the expense spread across the remaining weeks (never below a quarter of the pace).
  const lowerPaceAmount = Math.max(Math.ceil(weeklyPace - expense / weeksLeft), Math.ceil(weeklyPace / 4));
  const lowerPaceDeadline = addDays(startsOn, Math.ceil((remaining / lowerPaceAmount) * 7));
  const lowerPace: FlexOption = {
    choice: "lowerPace",
    weeklyPace: lowerPaceAmount,
    newDeadline: lowerPaceDeadline,
    pausedUntil: goal.pausedUntil,
    weeksLater: Math.max(1, Math.round(daysBetween(goal.deadline, lowerPaceDeadline) / 7)),
  };

  return { pause, lowerPace };
}
