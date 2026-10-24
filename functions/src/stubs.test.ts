import { describe, expect, it } from "vitest";
import { challengesStub, completeChallengeStub, leaderboardStub, safeToSaveStub } from "./stubs.js";

describe("safeToSaveStub", () => {
  it("amount matches the breakdown arithmetic", () => {
    const { amount, breakdown: b } = safeToSaveStub();
    const billsSum = b.upcomingBills.reduce((s, bill) => s + bill.amount, 0);
    expect(b.upcomingBillsTotal).toBe(billsSum);
    expect(amount).toBe(Math.max(0, b.currentBalance - b.upcomingBillsTotal - b.projectedSpending - b.safetyBuffer));
  });
});

describe("challengesStub", () => {
  it("assigns challenges to the caller", () => {
    const { challenges } = challengesStub("u1");
    expect(challenges.length).toBeGreaterThan(0);
    expect(challenges.every((c) => c.userId === "u1" && c.status === "active")).toBe(true);
  });
});

describe("completeChallengeStub", () => {
  it("completes a known challenge and awards its points", () => {
    const res = completeChallengeStub("u1", "stub-challenge-1");
    expect(res?.challenge.status).toBe("completed");
    expect(res?.pointsAwarded).toBe(res?.challenge.points);
    expect(res?.score.userId).toBe("u1");
  });

  it("returns null for an unknown id", () => {
    expect(completeChallengeStub("u1", "nope")).toBeNull();
  });
});

describe("leaderboardStub", () => {
  it("marks exactly one entry as the caller and ranks by points", () => {
    const { entries } = leaderboardStub("u1", "g1");
    expect(entries.filter((e) => e.isMe).map((e) => e.userId)).toEqual(["u1"]);
    const points = entries.map((e) => e.points);
    expect(points).toEqual([...points].sort((a, b) => b - a));
    expect(entries.map((e) => e.rank)).toEqual(entries.map((_, i) => i + 1));
  });

  it("never exposes dollar amounts", () => {
    const allowed = ["userId", "displayName", "rank", "isMe", "goalProgressPct", "streak", "improvementScore", "points", "level"];
    for (const e of leaderboardStub("u1", "g1").entries) {
      expect(Object.keys(e).sort()).toEqual([...allowed].sort());
    }
  });
});
