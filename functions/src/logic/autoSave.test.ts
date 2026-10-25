import { describe, expect, it } from "vitest";
import { generateSeedUser } from "../../../scripts/seedData.js";
import { addDays } from "./dates.js";
import { isPaydayToday, planAutoSaves, ruleAmount, validateAutoSaveRule, type AutoSaveGoal } from "./autoSave.js";

const TODAY = "2026-10-24";

const goal = (id: string, overrides: Partial<AutoSaveGoal["goal"]> = {}): AutoSaveGoal => ({
  id,
  goal: {
    targetAmount: 100000,
    currentAmount: 20000,
    autoSave: { kind: "percentOfBalance", percent: 10 },
    autoSaveLastRunOn: null,
    createdAt: `2026-0${id.length}-01T00:00:00.000Z`,
    ...overrides,
  },
});

describe("validateAutoSaveRule", () => {
  it.each([
    [null, null],
    [{ kind: "percentOfBalance", percent: 10 }, null],
    [{ kind: "fixed", amount: 2500 }, null],
    [{ kind: "percentOfBalance", percent: 0 }, "Percent must be a whole number from 1 to 50."],
    [{ kind: "percentOfBalance", percent: 75 }, "Percent must be a whole number from 1 to 50."],
    [{ kind: "percentOfBalance", percent: 10.5 }, "Percent must be a whole number from 1 to 50."],
    [{ kind: "fixed", amount: 50 }, "Amount must be at least $1."],
    [{ kind: "invest", amount: 5000 }, 'Auto-save kind must be "percentOfBalance" or "fixed".'],
    ["10%", "Auto-save rule must be an object or null."],
  ])("%j → %j", (rule, error) => {
    expect(validateAutoSaveRule(rule)).toBe(error);
  });
});

describe("isPaydayToday", () => {
  it("is true only when the recurring paycheck lands today", () => {
    const alex = generateSeedUser("demo-hero", TODAY);
    const lastPay = alex.transactions.filter((t) => t.merchant === "INITECH PAYROLL").at(-1)!;
    expect(isPaydayToday(alex.transactions, lastPay.date)).toBe(true);
    expect(isPaydayToday(alex.transactions, TODAY)).toBe(false);
    // A small refund isn't payday.
    expect(isPaydayToday([...alex.transactions, { merchant: "AMAZON REFUND", amount: -1500, date: TODAY }], TODAY)).toBe(false);
  });

  it("counts any $50+ payout for irregular earners", () => {
    const riley = generateSeedUser("irregular-income", TODAY);
    const payout = riley.transactions.filter((t) => t.amount < -5000).at(-1)!;
    expect(isPaydayToday(riley.transactions, payout.date)).toBe(true);
    expect(isPaydayToday([{ merchant: "VENMO", amount: -2000, date: TODAY }], TODAY)).toBe(false);
  });
});

describe("planAutoSaves", () => {
  it("moves the rule amount when there's room", () => {
    expect(ruleAmount({ kind: "percentOfBalance", percent: 10 }, 123456)).toBe(12345);
    expect(planAutoSaves([goal("a")], 200000, 50000, TODAY)).toEqual([
      { goalId: "a", wanted: 20000, amount: 20000, reason: "saved", note: "Auto-save on payday" },
    ]);
  });

  it("caps at remaining money so it can't leave the user short", () => {
    expect(planAutoSaves([goal("a")], 200000, 6500, TODAY)).toEqual([
      { goalId: "a", wanted: 20000, amount: 6500, reason: "capped", note: "Auto-save on payday (capped at your remaining money)" },
    ]);
  });

  it("shares the cap across goals, oldest goal first", () => {
    const plans = planAutoSaves([goal("bb", { autoSave: { kind: "fixed", amount: 5000 } }), goal("a")], 200000, 22000, TODAY);
    expect(plans.map((p) => [p.goalId, p.amount])).toEqual([["a", 20000], ["bb", 2000]]);
    expect(plans.reduce((s, p) => s + p.amount, 0)).toBe(22000);
  });

  it("skips when there's no remaining money, and never moves more than the goal needs", () => {
    expect(planAutoSaves([goal("a")], 200000, 0, TODAY)[0]).toMatchObject({ amount: 0, reason: "skipped" });
    expect(planAutoSaves([goal("a", { currentAmount: 95000 })], 200000, 50000, TODAY)[0]).toMatchObject({
      amount: 5000,
      reason: "saved",
      note: "Auto-save on payday: goal reached!",
    });
  });

  it("leaves out goals already run today, reached, or without a rule", () => {
    const goals = [goal("a", { autoSaveLastRunOn: TODAY }), goal("bb", { currentAmount: 100000 }), goal("ccc", { autoSave: null })];
    expect(planAutoSaves(goals, 200000, 50000, TODAY)).toEqual([]);
    expect(planAutoSaves([goal("a", { autoSaveLastRunOn: addDays(TODAY, -14) })], 200000, 50000, TODAY)).toHaveLength(1);
  });
});
