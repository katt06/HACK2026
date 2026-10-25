import { describe, expect, it } from "vitest";
import type { GoalEntryDoc } from "@contract";
import { goalTimeline, paceOn } from "./goalTimeline";

// Noon local time, so the local calendar day is the same in every time zone.
const at = (date: string) => new Date(`${date}T12:00:00`).toISOString();
const give = (date: string, amount: number, note = ""): GoalEntryDoc => ({ kind: "contribution", amount, verified: false, note, createdAt: at(date) });
const goal = { createdAt: at("2026-10-01"), currentAmount: 6000, deadline: "2026-12-01" };

describe("goalTimeline", () => {
  it("builds a running total from $0, one point per contribution day, ending today", () => {
    const entries = [give("2026-10-10", 2000, "coffee"), give("2026-10-03", 1000), give("2026-10-10", 3000, "gig")]; // newest first doesn't matter
    const t = goalTimeline(goal, entries, "2026-10-24");
    expect(t.points.map((p) => [p.date, p.saved, p.added])).toEqual([
      ["2026-10-01", 0, 0],
      ["2026-10-03", 1000, 1000],
      ["2026-10-10", 6000, 5000],
      ["2026-10-24", 6000, 0],
    ]);
    expect(t.points[2].notes).toEqual(["coffee", "gig"]);
    expect(t).toMatchObject({ start: "2026-10-01", end: "2026-12-01" });
  });

  it("starts from the unlogged balance and lists expenses", () => {
    const expense: GoalEntryDoc = { kind: "expense", amount: 9000, choice: "pause", weeksLater: 2, note: "Car", createdAt: at("2026-10-05") };
    const t = goalTimeline(goal, [give("2026-10-02", 1000), expense], "2026-10-24");
    expect(t.points[0].saved).toBe(5000);
    expect(t.points.at(-1)!.saved).toBe(6000);
    expect(t.expenses).toEqual([{ date: "2026-10-05", note: "Car" }]);
  });

  it("extends past an overdue deadline to today", () => {
    expect(goalTimeline({ ...goal, deadline: "2026-10-15" }, [], "2026-10-24").end).toBe("2026-10-24");
  });
});

describe("paceOn", () => {
  it("is a straight line from $0 to the target", () => {
    expect(paceOn("2026-10-01", "2026-10-01", "2026-10-11", 10000)).toBe(0);
    expect(paceOn("2026-10-06", "2026-10-01", "2026-10-11", 10000)).toBe(5000);
    expect(paceOn("2026-11-01", "2026-10-01", "2026-10-11", 10000)).toBe(10000);
  });
});
