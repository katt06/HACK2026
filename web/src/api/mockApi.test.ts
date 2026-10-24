import { describe, expect, it } from "vitest";
import { createMockApi, levelFor, type MockOptions } from "./mockApi";
import { PERSONAS } from "./mockData";

const NOW = new Date(2026, 9, 24, 12); // Sat Oct 24 2026, local time

function setup(options: MockOptions = {}) {
  return createMockApi({ delayMs: [0, 0], now: () => NOW, random: () => 0.5, ...options });
}

describe("getSafeToSave", () => {
  it.each(PERSONAS.map((p) => p.id))("%s: amount matches the breakdown", async (persona) => {
    const { api } = setup({ settings: { persona } });
    const { amount, breakdown: b, nextPayday, explanation } = await api.getSafeToSave();
    expect(b.upcomingBillsTotal).toBe(b.upcomingBills.reduce((s, bill) => s + bill.amount, 0));
    expect(amount).toBe(Math.max(0, b.currentBalance - b.upcomingBillsTotal - b.projectedSpending - b.safetyBuffer));
    expect(b.upcomingBills.every((bill) => bill.dueDate <= nextPayday)).toBe(true);
    expect(explanation.length).toBeGreaterThan(0);
  });

  it("dates are relative to today", async () => {
    const { api } = setup();
    expect((await api.getSafeToSave()).nextPayday).toBe("2026-10-30");
  });
});

describe("completeChallenge", () => {
  it("demo hero passes Riley and levels up on the first easy challenge", async () => {
    const { api } = setup();
    const before = await api.getLeaderboard("g");
    expect(before.entries.find((e) => e.isMe)?.rank).toBe(3);

    const easy = (await api.getChallenges()).challenges.find((c) => c.difficulty === "easy")!;
    const res = await api.completeChallenge(easy.id);
    expect(res.pointsAwarded).toBe(30);
    expect(res.score.points).toBe(310);
    expect(res.leveledUp).toBe(true);
    expect(res.challenge.status).toBe("completed");

    const after = await api.getLeaderboard("g");
    const me = after.entries.find((e) => e.isMe)!;
    expect(me.rank).toBe(2);
    expect(me.points).toBe(310);
  });

  it("replaces the completed challenge with a new one", async () => {
    const { api } = setup();
    const [first] = (await api.getChallenges()).challenges;
    await api.completeChallenge(first.id);
    const { challenges } = await api.getChallenges();
    expect(challenges).toHaveLength(3);
    expect(challenges.map((c) => c.id)).not.toContain(first.id);
  });

  it("only counts the streak once per day", async () => {
    const { api } = setup();
    const [a, b] = (await api.getChallenges()).challenges;
    const first = await api.completeChallenge(a.id);
    const second = await api.completeChallenge(b.id);
    expect(second.score.streak).toBe(first.score.streak);
  });

  it("rejects an already-completed challenge", async () => {
    const { api } = setup();
    const [first] = (await api.getChallenges()).challenges;
    await api.completeChallenge(first.id);
    await expect(api.completeChallenge(first.id)).rejects.toMatchObject({ code: "functions/not-found" });
  });

  it("returns copies, not live state", async () => {
    const { api } = setup();
    const res = await api.getChallenges();
    res.challenges.pop();
    expect((await api.getChallenges()).challenges).toHaveLength(3);
  });
});

describe("getLeaderboard", () => {
  it("ranks all personas by points with only score fields", async () => {
    const { api } = setup();
    const { entries } = await api.getLeaderboard("g");
    expect(entries).toHaveLength(PERSONAS.length);
    expect(entries.map((e) => e.rank)).toEqual([1, 2, 3, 4, 5]);
    const allowed = ["userId", "displayName", "rank", "isMe", "goalProgressPct", "streak", "improvementScore", "points", "level"].sort();
    for (const e of entries) {
      expect(Object.keys(e).sort()).toEqual(allowed);
      expect(e.level).toBe(levelFor(e.points));
    }
  });
});

describe("controls", () => {
  it("simulates errors, optionally for specific methods", async () => {
    const { api, controls } = setup();
    controls.errors(1, ["getSafeToSave"]);
    await expect(api.getSafeToSave()).rejects.toMatchObject({ code: "functions/unavailable" });
    await expect(api.getChallenges()).resolves.toBeDefined();
    controls.errors(0);
    await expect(api.getSafeToSave()).resolves.toBeDefined();
  });

  it("switching persona changes whose data is returned", async () => {
    const { api, controls } = setup();
    controls.persona("steady-saver");
    const { entries } = await api.getLeaderboard("g");
    expect(entries.find((e) => e.isMe)?.displayName).toBe("Priya");
  });

  it("reset restores the seed state", async () => {
    const { api, controls } = setup();
    const [first] = (await api.getChallenges()).challenges;
    await api.completeChallenge(first.id);
    controls.reset();
    expect((await api.getChallenges()).challenges[0].id).toBe(first.id);
  });

  it("reports settings changes for persistence", () => {
    let saved: unknown;
    const { controls } = setup({ onSettingsChange: (s) => (saved = s) });
    controls.persona("subscription-creep");
    expect(saved).toMatchObject({ persona: "subscription-creep" });
  });
});

describe("groups", () => {
  it("lists only groups the current persona is in, marking them as me", async () => {
    const { api } = setup();
    const groups = await api.getMyGroups();
    expect(groups.map((g) => g.name)).toEqual(["Demo Squad"]);
    expect(groups[0].members.filter((m) => m.isMe).map((m) => m.displayName)).toEqual(["Alex"]);
  });

  it("joins by code, ignoring case and dashes, and is idempotent", async () => {
    const { api } = setup();
    const first = await api.joinGroup("hus-tle");
    expect(first.alreadyMember).toBe(false);
    expect(first.group.members.map((m) => m.displayName)).toEqual(["Riley", "Priya", "Alex"]);
    const again = await api.joinGroup("HUSTLE");
    expect(again.alreadyMember).toBe(true);
    expect(again.group.members).toHaveLength(3);
    expect(await api.getMyGroups()).toHaveLength(2);
  });

  it("rejects unknown and malformed codes", async () => {
    const { api } = setup();
    await expect(api.joinGroup("ZZZZZZ")).rejects.toMatchObject({ code: "functions/not-found" });
    await expect(api.joinGroup("NOPE")).rejects.toMatchObject({ code: "functions/invalid-argument" });
  });

  it("creates a group with just me and a valid invite code", async () => {
    const { api } = setup();
    const g = await api.createGroup("  Roommates  ");
    expect(g.name).toBe("Roommates");
    expect(g.inviteCode).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
    expect(g.members).toEqual([{ userId: "mock-demo-hero", displayName: "Alex", isMe: true }]);
    await expect(api.createGroup("   ")).rejects.toBeDefined();
  });

  it("leaderboard only includes members of that group", async () => {
    const { api } = setup();
    const { entries } = await api.getLeaderboard("gig-crew");
    expect(entries.map((e) => e.displayName)).toEqual(["Priya", "Riley"]);
  });
});
