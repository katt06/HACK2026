import { describe, expect, it } from "vitest";
import { generateSeedData, generateSeedUser } from "../../../scripts/seedData.js";
import { addDays, daysBetween } from "./dates.js";
import { displayMerchant, forecastSafeToSave, noDataForecast, type Forecast } from "./forecast.js";
import { formatCents } from "./money.js";
import type { TransactionLike } from "./recurring.js";

const TODAY = "2026-10-24";

const every = (start: string, stepDays: number, count: number, merchant: string, amount: number): TransactionLike[] =>
  Array.from({ length: count }, (_, i) => ({ merchant, amount, date: addDays(start, stepDays * i) }));

const monthly = (dates: string[], merchant: string, amount: number): TransactionLike[] => dates.map((date) => ({ merchant, amount, date }));

function expectArithmetic(f: Forecast) {
  const b = f.breakdown;
  expect(b.upcomingBillsTotal).toBe(b.upcomingBills.reduce((s, bill) => s + bill.amount, 0));
  expect(f.amount).toBe(Math.max(0, b.currentBalance + b.expectedIncome - b.upcomingBillsTotal - b.projectedSpending - b.safetyBuffer));
  expect(b.upcomingBills.every((bill) => bill.dueDate >= TODAY && bill.dueDate <= f.nextPayday)).toBe(true);
  expect(f.explanation.length).toBeGreaterThanOrEqual(3);
  expect(f.explanation.length).toBeLessThanOrEqual(4);
  expect(f.explanation.join(" ")).not.toMatch(/NaN|undefined|null/);
}

describe("forecastSafeToSave, worked example", () => {
  // Biweekly pay (next: Oct 30), rent due Oct 28, Netflix due Nov 5, and $20/day at a deli for 60 days.
  const transactions = [
    ...every("2026-09-04", 14, 4, "ACME PAYROLL", -200000),
    ...monthly(["2026-07-28", "2026-08-28", "2026-09-28"], "MAPLE COURT APARTMENTS", 100000),
    ...monthly(["2026-08-05", "2026-09-05", "2026-10-05"], "NETFLIX.COM", 1500),
    ...every("2026-08-26", 1, 60, "CORNER DELI", 2000),
  ];
  const f = forecastSafeToSave({ today: TODAY, currentBalance: 150000, transactions });

  it("follows the formula", () => {
    expect(f.nextPayday).toBe("2026-10-30");
    expect(f.incomeIsIrregular).toBe(false);
    expect(f.breakdown).toEqual({
      currentBalance: 150000,
      expectedIncome: 0,
      upcomingBills: [{ merchant: "MAPLE COURT APARTMENTS", amount: 100000, dueDate: "2026-10-28" }], // Netflix is after payday
      upcomingBillsTotal: 100000,
      projectedSpending: 12000, // $20/day × 6 days; rent and Netflix aren't counted as everyday spending
      safetyBuffer: 10000, // 10% of bills beats the $50 minimum
    });
    expect(f.amount).toBe(28000);
    expectArithmetic(f);
  });

  it("explains it in plain English", () => {
    expect(f.explanation).toEqual([
      "You have $1,500.00 in checking and get paid again on Friday, Oct 30.",
      "Maple Court Apartments ($1,000.00) is due before then, so we set that aside first.",
      "Based on your last two months, about $120.00 covers everyday spending until then.",
      "We keep a $100.00 cushion, which leaves $280.00 you can safely move to your goal.",
    ]);
  });

  it("floors at zero and says so kindly", () => {
    const broke = forecastSafeToSave({ today: TODAY, currentBalance: 50000, transactions });
    expect(broke.amount).toBe(0);
    expect(broke.explanation.at(-1)).toBe("After a $100.00 cushion there's nothing extra this time, and that's okay.");
  });
});

describe("forecastSafeToSave, edge cases", () => {
  it("uses the $50 minimum buffer when bills are small", () => {
    const transactions = [...every("2026-09-04", 14, 4, "ACME PAYROLL", -200000), ...every("2026-08-26", 1, 60, "CORNER DELI", 1000)];
    expect(forecastSafeToSave({ today: TODAY, currentBalance: 100000, transactions }).breakdown.safetyBuffer).toBe(5000);
  });

  it("counts a weekly bill each time it lands before a monthly payday", () => {
    const today = "2026-10-20";
    const transactions = [
      ...monthly(["2026-07-28", "2026-08-28", "2026-09-28"], "NORTHWIND PAYROLL", -300000), // next payday Oct 28
      ...every("2026-09-23", 7, 4, "DOG WALKER", 3000), // last Oct 14 → due Oct 21 and Oct 28
    ];
    const f = forecastSafeToSave({ today, currentBalance: 100000, transactions });
    expect(f.nextPayday).toBe("2026-10-28");
    expect(f.breakdown.upcomingBills).toEqual([
      { merchant: "DOG WALKER", amount: 3000, dueDate: "2026-10-21" },
      { merchant: "DOG WALKER", amount: 3000, dueDate: "2026-10-28" },
    ]);
    expect(f.explanation[1]).toBe("Dog Walker ($60.00) is due before then, so we set that aside first.");
  });

  it("uses the 25th percentile of payouts when there's no regular payday", () => {
    // 8 payouts, 4 days apart: typical gap 4 → 3 payouts in 14 days; p25 of [10,10,20,20,30,30,40,40]k = 17,500
    const amounts = [10000, 20000, 30000, 40000, 10000, 20000, 30000, 40000];
    const transactions = amounts.map((a, i) => ({ merchant: i % 2 ? "UBER DRIVER PAYOUT" : "UPWORK PAYOUT", amount: -a, date: addDays(TODAY, -4 * i) }));
    const f = forecastSafeToSave({ today: TODAY, currentBalance: 0, transactions });
    expect(f.incomeIsIrregular).toBe(true);
    expect(f.nextPayday).toBe(addDays(TODAY, 14));
    expect(f.breakdown.expectedIncome).toBe(3 * 17500);
    expect(f.explanation[0]).toContain("only count $525.00 of likely payouts");
    expectArithmetic(f);
  });

  it("averages over the available history when it's shorter than 60 days", () => {
    const transactions = [...every("2026-09-04", 14, 4, "ACME PAYROLL", -200000), ...every("2026-10-15", 1, 10, "CORNER DELI", 3000)];
    const f = forecastSafeToSave({ today: TODAY, currentBalance: 100000, transactions });
    // History starts Sep 4 (51 days) → $300 / 51 days × 6 days
    expect(f.breakdown.projectedSpending).toBe(Math.round((30000 / 51) * 6));
    expect(f.explanation[2]).toContain("Based on your recent spending");
  });

  it("has a no-data response for brand-new users", () => {
    const f = noDataForecast(TODAY);
    expect(f.amount).toBe(0);
    expect(f.explanation[0]).toMatch(/don't have any account activity/);
  });
});

describe("forecastSafeToSave on seed users", () => {
  it("2. irregular income: plans two weeks ahead with a conservative payout estimate", () => {
    const riley = generateSeedUser("irregular-income", TODAY);
    const f = forecastSafeToSave({ today: TODAY, currentBalance: riley.account.currentBalance, transactions: riley.transactions });
    expect(f.incomeIsIrregular).toBe(true);
    expect(f.nextPayday).toBe(addDays(TODAY, 14));

    // Conservative: less than what actually arrived in a typical two weeks over the last 90 days.
    const from = addDays(TODAY, -89);
    const received = riley.transactions.filter((t) => t.amount < 0 && t.date >= from).reduce((s, t) => s - t.amount, 0);
    expect(f.breakdown.expectedIncome).toBeGreaterThan(0);
    expect(f.breakdown.expectedIncome).toBeLessThan((received / 90) * 14);

    expect(f.breakdown.upcomingBills.map((b) => b.merchant)).toContain("OAKWOOD RESIDENTIAL"); // rent due Nov 3
    expectArithmetic(f);
  });

  it("5. demo hero: rent and Spotify are set aside before Friday's payday", () => {
    const alex = generateSeedUser("demo-hero", TODAY);
    const f = forecastSafeToSave({ today: TODAY, currentBalance: alex.account.currentBalance, transactions: alex.transactions });
    expect(f.nextPayday).toBe(addDays(TODAY, 6));
    expect(f.breakdown.upcomingBills.map((b) => b.merchant).sort()).toEqual(["ELM STREET APARTMENTS", "SPOTIFY USA"]);
    expect(f.breakdown.upcomingBillsTotal).toBe(91099);
    expect(f.breakdown.safetyBuffer).toBe(9110);
    expect(f.amount).toBeGreaterThan(0);
    expect(f.explanation[1]).toBe("Elm Street Apartments and Spotify USA ($910.99) are due before then, so we set that aside first.");
    expectArithmetic(f);
  });

  it("produces a valid forecast for every seed user", () => {
    for (const u of generateSeedData(TODAY).users) {
      const f = forecastSafeToSave({ today: TODAY, currentBalance: u.account.currentBalance, transactions: u.transactions });
      expect(daysBetween(TODAY, f.nextPayday)).toBeGreaterThanOrEqual(0);
      expectArithmetic(f);
    }
  });
});

describe("formatting", () => {
  it("formats cents and merchant names", () => {
    expect(formatCents(124000)).toBe("$1,240.00");
    expect(formatCents(-599)).toBe("-$5.99");
    expect(displayMerchant("CITY POWER & LIGHT")).toBe("City Power & Light");
    expect(displayMerchant("SPOTIFY USA")).toBe("Spotify USA");
  });
});
