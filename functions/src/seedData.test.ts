// Checks that the demo data generator in /scripts tells each persona's story.
// Lives here so it runs with `npm test`; later logic tests import the same seed users.
import { describe, expect, it } from "vitest";
import { generateSeedData, generateSeedUser, HISTORY_DAYS, PERSONA_IDS, splitIntoChallenges } from "../../scripts/seedData.js";
import { balanceOn } from "./logic/safeToSaveHistory.js";
import { blendedScore, levelFor, rankLeaderboard } from "./logic/scoring.js";
import { addDays, dayOfWeek, daysBetween } from "./logic/dates.js";

const TODAY = "2026-10-24";
const data = generateSeedData(TODAY);
const user = (uid: (typeof PERSONA_IDS)[number]) => data.users.find((u) => u.uid === uid)!;
const byMerchant = (uid: (typeof PERSONA_IDS)[number], merchant: string) =>
  user(uid).transactions.filter((t) => t.merchant === merchant);

describe("generateSeedData", () => {
  it("is deterministic for the same date and seed", () => {
    expect(generateSeedData(TODAY)).toEqual(data);
    expect(generateSeedUser("demo-hero", TODAY, 7)).not.toEqual(user("demo-hero"));
  });

  it("covers ~6 months ending today for every user, oldest first", () => {
    for (const u of data.users) {
      const dates = u.transactions.map((t) => t.date);
      expect(dates).toEqual([...dates].sort());
      expect(dates[0] >= addDays(TODAY, -(HISTORY_DAYS - 1))).toBe(true);
      expect(dates.at(-1)! <= TODAY).toBe(true);
      expect(daysBetween(dates[0], dates.at(-1)!)).toBeGreaterThan(170);
      expect(u.transactions.every((t) => Number.isInteger(t.amount) && t.amount !== 0)).toBe(true);
    }
  });

  it("puts everyone in the demo group and leaves Alex out of the joinable one", () => {
    expect(data.groups["demo-group"].members).toEqual([...PERSONA_IDS]);
    expect(data.groups["side-hustle"].members).not.toContain("demo-hero");
    expect(data.groups["side-hustle"].inviteCode).toMatch(/^[A-Z2-9]{6}$/);
  });

  it("keeps variable bills within ±5% and fixed ones exact", () => {
    const power = byMerchant("delivery-spender", "CITY POWER & LIGHT").map((t) => t.amount);
    expect(power.length).toBeGreaterThanOrEqual(5);
    expect(power.every((a) => a >= 9000 * 0.95 && a <= 9000 * 1.05)).toBe(true);
    expect(new Set(power).size).toBeGreaterThan(1);
    expect(new Set(byMerchant("delivery-spender", "MAPLE COURT APARTMENTS").map((t) => t.amount))).toEqual(new Set([110000]));
  });

  it("gives every user a goal whose progress matches their contributions", () => {
    for (const u of data.users) {
      expect(u.goal.ownerId).toBe(u.uid);
      expect(u.goal.currentAmount).toBe(u.contributions.reduce((s, c) => s + c.amount, 0));
      expect(u.goal.currentAmount).toBeLessThan(u.goal.targetAmount);
      expect(u.goal.deadline > TODAY).toBe(true);
      expect(u.goal.createdAt < u.contributions[0].createdAt).toBe(true);
      // Same shape the security rules accept from clients.
      expect(u.contributions.every((c) => c.kind === "contribution" && !c.verified && c.note.length <= 80)).toBe(true);
      expect(u.baselineSpendByCategory.income).toBeUndefined();
    }
  });
});

describe("persona stories", () => {
  it("1. delivery spender: biweekly salary, delivery spikes on weekends", () => {
    const pay = byMerchant("delivery-spender", "ACME CORP PAYROLL").map((t) => t.date);
    expect(pay.slice(1).every((d, i) => daysBetween(pay[i], d) === 14)).toBe(true);

    const delivery = user("delivery-spender").transactions.filter((t) => t.category === "delivery");
    const weekend = delivery.filter((t) => [0, 5, 6].includes(dayOfWeek(t.date))).length / 3;
    const weekday = delivery.filter((t) => ![0, 5, 6].includes(dayOfWeek(t.date))).length / 4;
    expect(weekend).toBeGreaterThan(weekday * 3); // per day of week
  });

  it("2. irregular income: payouts vary in size and timing", () => {
    const payouts = user("irregular-income").transactions.filter((t) => t.amount < 0);
    const amounts = payouts.map((t) => -t.amount);
    expect(Math.max(...amounts)).toBeGreaterThan(Math.min(...amounts) * 3);
    const gaps = new Set(payouts.slice(1).map((t, i) => daysBetween(payouts[i].date, t.date)));
    expect(gaps.size).toBeGreaterThan(4);
  });

  it("3. subscription creep: 7+ subscriptions, each charged at least 3 times", () => {
    const subs = user("subscription-creep").transactions.filter((t) => t.category === "subscriptions");
    const counts = new Map<string, number>();
    for (const t of subs) counts.set(t.merchant, (counts.get(t.merchant) ?? 0) + 1);
    expect(counts.size).toBeGreaterThanOrEqual(7);
    expect([...counts.values()].every((n) => n >= 3)).toBe(true);
    expect(counts.has("PLANET FITNESS") && counts.has("AUDIBLE")).toBe(true);
  });

  it("4. steady saver: long contribution streak and dining trending down", () => {
    const u = user("steady-saver");
    expect(u.contributions.slice(-12).every((c) => c.amount === 7500)).toBe(true);
    const mid = addDays(TODAY, -HISTORY_DAYS / 2);
    const dining = u.transactions.filter((t) => t.category === "dining");
    expect(dining.filter((t) => t.date >= mid).length).toBeLessThan(dining.filter((t) => t.date < mid).length);
  });

  it("5. demo hero: rent and Spotify fall due before the next payday", () => {
    const lastPay = byMerchant("demo-hero", "INITECH PAYROLL").at(-1)!.date;
    expect(lastPay).toBe(addDays(TODAY, -8)); // next payday is today + 6
    const rentDay = Number(byMerchant("demo-hero", "ELM STREET APARTMENTS").at(-1)!.date.slice(8));
    expect(rentDay).toBe(Number(addDays(TODAY, 4).slice(8)));
  });
});

describe("balances and transfers", () => {
  it("mirrors each goal contribution as a transfer out of checking", () => {
    for (const u of data.users) {
      const transfers = new Set(u.transactions.filter((t) => t.category === "transfer").map((t) => `${t.date}:${t.amount}`));
      expect(u.contributions.every((c) => transfers.has(`${c.createdAt.slice(0, 10)}:${c.amount}`))).toBe(true);
    }
  });

  it("never lets the rebuilt balance go negative, so past safe-to-save is realistic", () => {
    for (const u of data.users) {
      const input = { today: TODAY, currentBalance: u.account.currentBalance, balanceAsOf: TODAY, transactions: u.transactions };
      for (let d = 0; d < HISTORY_DAYS - 1; d++) expect(balanceOn(addDays(TODAY, -d), input)).toBeGreaterThanOrEqual(0);
    }
    expect(user("demo-hero").account.currentBalance).toBe(124000); // still the designed demo balance
  });
});

describe("scores and the leaderboard demo", () => {
  it("gives each persona its designed weekly streak", () => {
    expect(Object.fromEntries(data.users.map((u) => [u.uid, u.score.streak]))).toEqual({
      "delivery-spender": 2,
      "irregular-income": 5,
      "subscription-creep": 1,
      "steady-saver": 12,
      "demo-hero": 4,
    });
  });

  it("matches each score's points to its completed challenges plus progress", () => {
    for (const u of data.users) {
      expect(u.completedChallenges.every((c) => c.status === "completed" && c.userId === u.uid)).toBe(true);
      expect(u.score.points).toBeGreaterThanOrEqual(u.completedChallenges.reduce((s, c) => s + c.points, 0));
      expect(u.score.level).toBe(levelFor(u.score.points));
    }
  });

  it("puts Alex just behind Riley, and one easy challenge moves Alex ahead and up a level", () => {
    const rows = data.users.map((u) => ({ ...u.score, displayName: u.displayName }));
    const before = rankLeaderboard(rows, "demo-hero");
    const rank = (entries: typeof before, uid: string) => entries.find((e) => e.userId === uid)!.rank;
    expect(before[0].userId).toBe("steady-saver");
    expect(rank(before, "demo-hero")).toBe(rank(before, "irregular-income") + 1);

    const alex = user("demo-hero").score;
    const after = rankLeaderboard(
      rows.map((r) => (r.userId === "demo-hero" ? { ...r, points: r.points + 30, level: levelFor(r.points + 30) } : r)),
      "demo-hero",
    );
    expect(rank(after, "demo-hero")).toBe(rank(after, "irregular-income") - 1);
    expect(levelFor(alex.points + 30)).toBe(alex.level + 1);
    expect(blendedScore(alex)).toBeLessThan(blendedScore(user("irregular-income").score));
  });

  it("splits challenge points into 30/50/80 pieces", () => {
    expect(splitIntoChallenges(0)).toEqual([]);
    expect(splitIntoChallenges(160)).toEqual(["hard", "hard"]);
    expect(splitIntoChallenges(110)).toEqual(["hard", "easy"]);
    expect(splitIntoChallenges(40)).toBeNull();
  });
});
