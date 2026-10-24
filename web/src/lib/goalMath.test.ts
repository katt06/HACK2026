import { describe, expect, it } from "vitest";
import { addDays, daysBetween } from "./dates";
import { flexOptions, goalPlan, progressPct } from "./goalMath";

const TODAY = "2026-10-24";
// $1,200 left, 12 weeks, so $100/wk.
const goal = { targetAmount: 150000, currentAmount: 30000, deadline: addDays(TODAY, 84), pausedUntil: null };

describe("goalPlan", () => {
  it("computes the weekly pace to the deadline", () => {
    expect(goalPlan(goal, TODAY)).toMatchObject({ status: "onTrack", remaining: 120000, weeklyPace: 10000, weeksLeft: 12, paused: false });
  });

  it("starts the clock after a pause", () => {
    const plan = goalPlan({ ...goal, pausedUntil: addDays(TODAY, 28) }, TODAY);
    expect(plan).toMatchObject({ status: "onTrack", weeklyPace: 15000, paused: true, startsOn: addDays(TODAY, 28) });
  });

  it("treats the last week as one full week", () => {
    expect(goalPlan({ ...goal, deadline: addDays(TODAY, 3) }, TODAY)).toMatchObject({ weeklyPace: 120000 });
  });

  it("reports reached and overdue goals", () => {
    expect(goalPlan({ ...goal, currentAmount: 150000 }, TODAY).status).toBe("reached");
    expect(goalPlan({ ...goal, deadline: TODAY }, TODAY).status).toBe("overdue");
  });
});

describe("flexOptions", () => {
  it("matches the $300 car repair example", () => {
    const opts = flexOptions(goal, 30000, TODAY)!;
    expect(opts.pause).toEqual({ choice: "pause", weeklyPace: 10000, newDeadline: addDays(TODAY, 105), pausedUntil: addDays(TODAY, 21), weeksLater: 3 });
    expect(opts.lowerPace).toEqual({ choice: "lowerPace", weeklyPace: 7500, newDeadline: addDays(TODAY, 112), pausedUntil: null, weeksLater: 4 });
  });

  it("applying either option yields the promised pace", () => {
    const opts = flexOptions(goal, 30000, TODAY)!;
    for (const o of [opts.pause, opts.lowerPace]) {
      const after = goalPlan({ ...goal, deadline: o.newDeadline, pausedUntil: o.pausedUntil }, TODAY);
      expect(after).toMatchObject({ status: "onTrack", weeklyPace: o.weeklyPace });
    }
  });

  it("never lowers the pace below a quarter", () => {
    expect(flexOptions(goal, 500000, TODAY)!.lowerPace.weeklyPace).toBe(2500);
  });

  it("returns null when there's nothing to flex", () => {
    expect(flexOptions({ ...goal, currentAmount: 150000 }, 30000, TODAY)).toBeNull();
    expect(flexOptions(goal, 0, TODAY)).toBeNull();
  });
});

describe("helpers", () => {
  it("progressPct clamps to 0–100", () => {
    expect(progressPct({ targetAmount: 120000, currentAmount: 50400 })).toBe(42);
    expect(progressPct({ targetAmount: 100, currentAmount: 500 })).toBe(100);
  });

  it("date math ignores DST", () => {
    expect(daysBetween("2026-11-01", "2026-11-02")).toBe(1);
    expect(addDays("2026-03-07", 2)).toBe("2026-03-09");
  });
});
