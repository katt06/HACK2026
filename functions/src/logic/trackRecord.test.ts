import { describe, expect, it } from "vitest";
import { generateSeedData, generateSeedUser } from "../../../scripts/seedData.js";
import { addDays } from "./dates.js";
import type { TransactionLike } from "./recurring.js";
import { backtest, checkpoints } from "./trackRecord.js";

const TODAY = "2026-10-24";
const inputFor = (u: ReturnType<typeof generateSeedUser>) => ({
  today: TODAY,
  currentBalance: u.account.currentBalance,
  balanceAsOf: TODAY,
  transactions: u.transactions,
});

describe("checkpoints", () => {
  it("uses real paydays after 90 days of history, and two-week check-ins for irregular income", () => {
    const alex = checkpoints(inputFor(generateSeedUser("demo-hero", TODAY)));
    expect(alex.paydays).toBe(true);
    expect(alex.dates.length).toBeGreaterThan(3);
    expect(alex.dates.every((d) => d < TODAY)).toBe(true);
    const riley = checkpoints(inputFor(generateSeedUser("irregular-income", TODAY)));
    expect(riley.paydays).toBe(false);
    expect(riley.dates.at(-1)).toBe(addDays(TODAY, -14));
  });
});

describe("backtest", () => {
  it("summarizes how often moving the suggested amount kept the balance above $0", () => {
    for (const u of generateSeedData(TODAY).users) {
      const record = backtest(inputFor(u))!;
      expect(record.checks).toBeGreaterThan(0);
      expect(record.stayedPositive).toBeLessThanOrEqual(record.checks);
      expect(record.summary).toMatch(/^Since \w{3} \d{1,2}, moving the suggested amount on each of your last \d+ (paydays|two-week check-ins) would have kept you above \$0 /);
      expect(record.summary).not.toMatch(/NaN|undefined|Infinity/);
    }
  });

  it("holds up across the personas (the reason projected spending plans for a heavy stretch)", () => {
    const records = generateSeedData(TODAY).users.map((u) => backtest(inputFor(u))!);
    const kept = records.reduce((s, r) => s + r.stayedPositive, 0);
    const checks = records.reduce((s, r) => s + r.checks, 0);
    expect(kept / checks).toBeGreaterThanOrEqual(0.85);
  });

  it("reports a miss the forecast couldn't have seen coming", () => {
    // Paid $1,000 every two weeks, spends $40/day, then a one-off $1,500 car repair 3 days after a payday.
    // (Balance is high enough that the rebuilt history never goes negative on its own.)
    const start = "2026-04-28";
    const txs: TransactionLike[] = [];
    for (let d = 0; d < 180; d++) {
      const date = addDays(start, d);
      if (d % 14 === 0) txs.push({ merchant: "ACME PAYROLL", amount: -100000, date });
      txs.push({ merchant: "CORNER DELI", amount: 4000, date });
    }
    const steady = backtest({ today: TODAY, currentBalance: 800000, balanceAsOf: TODAY, transactions: txs })!;
    txs.push({ merchant: "MIDAS AUTO REPAIR", amount: 150000, date: addDays(start, 14 * 11 + 3) });
    const surprise = backtest({ today: TODAY, currentBalance: 800000, balanceAsOf: TODAY, transactions: txs })!;
    expect(steady.stayedPositive).toBe(steady.checks);
    expect(surprise.stayedPositive).toBeLessThan(surprise.checks);
    expect(surprise.summary).toMatch(/would have kept you above \$0 \d+ of \d+ times\.$/);
  });

  it("is null without enough history", () => {
    const short = [{ merchant: "ACME PAYROLL", amount: -100000, date: addDays(TODAY, -20) }];
    expect(backtest({ today: TODAY, currentBalance: 100000, balanceAsOf: TODAY, transactions: short })).toBeNull();
  });
});
