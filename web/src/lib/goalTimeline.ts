import type { Cents, GoalDoc, GoalEntryDoc, IsoDate } from "@contract";
import { daysBetween, localDate } from "./dates";

export interface TimelinePoint {
  date: IsoDate;
  saved: Cents; // running total at the end of this day
  added: Cents; // contributed this day
  notes: string[];
}

export interface GoalTimeline {
  start: IsoDate;
  end: IsoDate; // the later of the deadline and today
  points: TimelinePoint[]; // oldest first: goal start, one per contribution day, then today
  expenses: { date: IsoDate; note: string }[]; // goal flex moments
}

// Running total of contributions over time. If the goal's balance is more than its logged entries
// (money added before entries existed), the difference counts as the starting amount.
export function goalTimeline(goal: Pick<GoalDoc, "createdAt" | "currentAmount" | "deadline">, entries: GoalEntryDoc[], today: IsoDate): GoalTimeline {
  const start = localDate(goal.createdAt);
  const contributions = entries.filter((e) => e.kind === "contribution").sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const logged = contributions.reduce((sum, c) => sum + c.amount, 0);

  const points: TimelinePoint[] = [{ date: start, saved: Math.max(0, goal.currentAmount - logged), added: 0, notes: [] }];
  for (const c of contributions) {
    const date = localDate(c.createdAt) < start ? start : localDate(c.createdAt);
    const last = points[points.length - 1];
    const point = last.date === date ? last : { date, saved: last.saved, added: 0, notes: [] };
    point.saved += c.amount;
    point.added += c.amount;
    if (c.note) point.notes.push(c.note);
    if (point !== last) points.push(point);
  }
  const last = points[points.length - 1];
  if (today > last.date) points.push({ date: today, saved: last.saved, added: 0, notes: [] });

  return {
    start,
    end: goal.deadline > today ? goal.deadline : today,
    points,
    expenses: entries.filter((e) => e.kind === "expense").map((e) => ({ date: localDate(e.createdAt), note: e.note })),
  };
}

// Where a steady saver would be on a date: a straight line from $0 at the start to the target at the deadline.
export function paceOn(date: IsoDate, start: IsoDate, deadline: IsoDate, target: Cents): Cents {
  const total = daysBetween(start, deadline);
  if (total <= 0) return target;
  return Math.round(target * Math.min(1, Math.max(0, daysBetween(start, date) / total)));
}
