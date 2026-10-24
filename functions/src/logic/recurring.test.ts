import { describe, expect, it } from "vitest";
import { generateSeedData, generateSeedUser } from "../../../scripts/seedData.js";
import { addDays } from "./dates.js";
import { assignRecurring, categorize, detectRecurring, normalizeMerchant, recurringDocId, type TransactionLike } from "./recurring.js";

const TODAY = "2026-10-24";
const deliverySpender = generateSeedUser("delivery-spender", TODAY); // seed user 1
const subscriptionCreep = generateSeedUser("subscription-creep", TODAY); // seed user 3

describe("categorize", () => {
  it.each([
    ["DOORDASH*THAI BASIL", "delivery"],
    ["UBER EATS", "delivery"],
    ["UBER TRIP 8812", "transport"],
    ["THAI BASIL KITCHEN", "dining"],
    ["SQ *BLUE BOTTLE", "coffee"],
    ["APPLE.COM/BILL", "subscriptions"],
    ["MAPLE COURT APARTMENTS", "rent"],
    ["METRO WATER & POWER", "utilities"],
    ["TRADER JOE'S #552", "groceries"],
    ["ACME CORP PAYROLL", "income"],
    ["TRANSFER TO SAVINGS", "transfer"],
    ["SOME RANDOM SHOP", "other"],
  ])("%s → %s", (merchant, category) => {
    expect(categorize(merchant)).toBe(category);
  });

  it("treats any inflow as income", () => {
    expect(categorize("VENMO", -5000)).toBe("income");
  });

  it("agrees with the category the seed assigned to every merchant", () => {
    const mismatches = generateSeedData(TODAY)
      .users.flatMap((u) => u.transactions)
      .filter((t) => categorize(t.merchant, t.amount) !== t.category)
      .map((t) => `${t.merchant}: ${categorize(t.merchant, t.amount)} ≠ ${t.category}`);
    expect([...new Set(mismatches)]).toEqual([]);
  });
});

describe("normalizeMerchant", () => {
  it.each([
    ["DOORDASH*CHIPOTLE", "doordash"],
    ["SQ *BLUE BOTTLE #12", "blue bottle"],
    ["STARBUCKS STORE 1123", "starbucks"],
    ["SHELL OIL 0457", "shell oil"],
    ["  Netflix.com ", "netflix com"],
  ])("%s → %s", (raw, normalized) => {
    expect(normalizeMerchant(raw)).toBe(normalized);
  });
});

describe("detectRecurring on seed user 1 (delivery spender)", () => {
  const series = detectRecurring(deliverySpender.transactions, TODAY);
  const byMerchant = Object.fromEntries(series.map((s) => [s.merchant, s]));

  it("finds exactly the paycheck and the bills", () => {
    expect(Object.keys(byMerchant).sort()).toEqual(
      ["ACME CORP PAYROLL", "CITY POWER & LIGHT", "MAPLE COURT APARTMENTS", "SPOTIFY USA", "VERIZON WIRELESS"].sort(),
    );
  });

  it("flags the biweekly paycheck as payday, due a week from today", () => {
    expect(byMerchant["ACME CORP PAYROLL"]).toMatchObject({ cadence: "biweekly", isPayday: true, category: "income", nextDue: addDays(TODAY, 7) });
    expect(series.filter((s) => s.isPayday)).toHaveLength(1);
  });

  it("projects monthly bills, including ones with ±5% jitter and late posting", () => {
    expect(byMerchant["MAPLE COURT APARTMENTS"]).toMatchObject({ cadence: "monthly", amount: 110000, nextDue: "2026-11-01", category: "rent" });
    expect(byMerchant["SPOTIFY USA"]).toMatchObject({ cadence: "monthly", amount: 1099, nextDue: "2026-11-09" });
    expect(byMerchant["CITY POWER & LIGHT"]).toMatchObject({ cadence: "monthly", category: "utilities" });
    expect(byMerchant["CITY POWER & LIGHT"].amount).toBeGreaterThan(9000 * 0.95);
    expect(byMerchant["CITY POWER & LIGHT"].amount).toBeLessThan(9000 * 1.05);
  });

  it("does not treat weekend delivery or groceries as recurring", () => {
    expect(series.some((s) => s.category === "delivery" || s.category === "groceries")).toBe(false);
  });
});

describe("detectRecurring on seed user 3 (subscription creep)", () => {
  const series = detectRecurring(subscriptionCreep.transactions, TODAY);

  it("finds all 8 subscriptions as monthly, including the newer ones", () => {
    const subs = series.filter((s) => s.category === "subscriptions");
    expect(subs.map((s) => s.merchant).sort()).toEqual(
      ["ADOBE *CREATIVE CLOUD", "APPLE.COM/BILL", "AUDIBLE", "DISNEY PLUS", "HULU", "NETFLIX.COM", "PLANET FITNESS", "SPOTIFY USA"].sort(),
    );
    expect(subs.every((s) => s.cadence === "monthly" && s.nextDue > TODAY)).toBe(true);
  });

  it("flags the monthly paycheck as payday", () => {
    const paydays = series.filter((s) => s.isPayday);
    expect(paydays).toHaveLength(1);
    expect(paydays[0]).toMatchObject({ merchant: "NORTHWIND PAYROLL", cadence: "monthly", nextDue: "2026-10-28" });
  });

  it("ignores dining and shopping", () => {
    expect(series.some((s) => ["dining", "shopping", "groceries"].includes(s.category))).toBe(false);
  });
});

describe("detectRecurring rules", () => {
  const weekly = (amounts: number[], start = "2026-09-01"): TransactionLike[] =>
    amounts.map((amount, i) => ({ merchant: "GYM CLASS", amount, date: addDays(start, 7 * i) }));

  it("detects a weekly charge", () => {
    expect(detectRecurring(weekly([2000, 2000, 2000, 2000]), "2026-09-25")).toMatchObject([
      { cadence: "weekly", amount: 2000, nextDue: "2026-09-29", occurrences: 4 },
    ]);
  });

  it("needs at least 3 occurrences", () => {
    expect(detectRecurring(weekly([2000, 2000]), "2026-09-10")).toEqual([]);
  });

  it("rejects amounts more than 10% off the median", () => {
    expect(detectRecurring(weekly([2000, 2000, 2000, 2300]), "2026-09-25")).toEqual([]);
    expect(detectRecurring(weekly([2000, 2000, 2000, 2150]), "2026-09-25")).toHaveLength(1);
  });

  it("rejects gaps that match no cadence", () => {
    const txs = [0, 21, 42, 63].map((d) => ({ merchant: "EVERY 3 WEEKS", amount: 1000, date: addDays("2026-06-01", d) }));
    expect(detectRecurring(txs, "2026-08-10")).toEqual([]);
  });

  it("marks a late charge due today, skips one missed cycle, and drops a cancelled series", () => {
    const txs = weekly([2000, 2000, 2000]); // last on 2026-09-15, next due 2026-09-22
    expect(detectRecurring(txs, "2026-09-24")[0].nextDue).toBe("2026-09-24");
    expect(detectRecurring(txs, "2026-09-27")[0].nextDue).toBe("2026-09-29");
    expect(detectRecurring(txs, "2026-10-05")).toEqual([]);
  });

  it("keeps refunds separate from charges at the same merchant", () => {
    const txs = [...weekly([2000, 2000, 2000]), { merchant: "GYM CLASS", amount: -2000, date: "2026-09-16" }];
    expect(detectRecurring(txs, "2026-09-16")).toHaveLength(1);
  });
});

describe("assignRecurring", () => {
  it("links each seed transaction to its series and leaves the rest null", () => {
    const txs = deliverySpender.transactions.map((t, i) => ({ ...t, id: `t${i}` }));
    const { recurring, recurringIdByTxId } = assignRecurring("delivery-spender", txs, TODAY);
    expect(recurring.map((r) => r.id)).toContain("delivery-spender_acme-corp-payroll_in");
    expect(recurring.every((r) => r.userId === "delivery-spender")).toBe(true);

    const rentId = recurringDocId("delivery-spender", "maple court apartments|out");
    for (const t of txs) {
      const expected = t.merchant === "MAPLE COURT APARTMENTS" ? rentId : t.category === "delivery" ? null : undefined;
      if (expected !== undefined) expect(recurringIdByTxId[t.id]).toBe(expected);
    }
  });
});
