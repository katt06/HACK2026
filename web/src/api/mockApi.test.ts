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

  it("doesn't change the weekly saving streak", async () => {
    const { api } = setup();
    const [a] = (await api.getChallenges()).challenges;
    expect((await api.completeChallenge(a.id)).score.streak).toBe(4);
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
  it("ranks all personas like the server, with only score fields", async () => {
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

describe("watchMyGroups", () => {
  const flush = () => new Promise((r) => setTimeout(r, 0));

  it("emits now, on every change, and stops after unsubscribe", async () => {
    const { api, controls } = setup();
    const seen: string[][] = [];
    const stop = api.watchMyGroups((gs) => seen.push(gs.map((g) => `${g.name}:${g.members.length}`)), () => {});
    await flush();
    expect(seen).toEqual([["Demo Squad:5"]]);

    const created = await api.createGroup("Roommates");
    expect(controls.simulateJoin("delivery-spender")).toBe("Jordan joined Roommates");
    expect(seen.at(-1)).toEqual(["Demo Squad:5", "Roommates:2"]);
    expect(created.members).toHaveLength(1);

    stop();
    controls.simulateJoin("steady-saver");
    expect(seen.at(-1)).toEqual(["Demo Squad:5", "Roommates:2"]);
  });

  it("reports simulated errors through onError", async () => {
    const { api, controls } = setup();
    controls.errors(1, ["watchMyGroups"]);
    let error: unknown;
    api.watchMyGroups(() => {}, (err) => (error = err));
    await flush();
    expect(error).toMatchObject({ code: "functions/unavailable" });
  });

  it("simulateJoin explains what went wrong", () => {
    const { controls } = setup();
    expect(() => controls.simulateJoin("steady-saver")).toThrow("Priya is already in Demo Squad.");
  });
});

describe("goals", () => {
  it("seeds each persona's goal to match their score's progress", async () => {
    for (const p of PERSONAS) {
      const { api } = setup({ settings: { persona: p.id } });
      const [goal] = await api.getMyGoals();
      expect(Math.round((goal.currentAmount / goal.targetAmount) * 100)).toBe(p.score.goalProgressPct);
    }
  });

  it("creates a goal and logs unverified contributions, newest first", async () => {
    const { api } = setup();
    const goal = await api.createGoal({ name: " Concert ", targetAmount: 20000, deadline: "2026-12-01" });
    expect(goal).toMatchObject({ name: "Concert", currentAmount: 0, verified: false, pausedUntil: null });
    await api.addContribution(goal.id, 2500, "first");
    await api.addContribution(goal.id, 1000);
    const { goal: after, entries } = await api.getGoal(goal.id);
    expect(after.currentAmount).toBe(3500);
    expect(entries.map((e) => [e.amount, e.kind === "contribution" && e.verified])).toEqual([[1000, false], [2500, false]]);
    expect((await api.getMyGoals()).map((g) => g.name)).toEqual(["Concert", "Spring break trip"]);
  });

  it("applies a flex choice and records the expense without touching the balance", async () => {
    const { api } = setup();
    const [goal] = await api.getMyGoals();
    const option = { choice: "pause" as const, weeklyPace: 5800, newDeadline: "2027-02-06", pausedUntil: "2026-11-07", weeksLater: 2 };
    await api.applyGoalFlex(goal.id, 9000, option, "Car repair");
    const { goal: after, entries } = await api.getGoal(goal.id);
    expect(after).toMatchObject({ deadline: "2027-02-06", pausedUntil: "2026-11-07", currentAmount: goal.currentAmount });
    expect(entries[0]).toMatchObject({ kind: "expense", amount: 9000, choice: "pause", weeksLater: 2, note: "Car repair" });
  });

  it("rejects invalid goals and other personas' goals", async () => {
    const { api, controls } = setup();
    await expect(api.createGoal({ name: "", targetAmount: 100, deadline: "2026-12-01" })).rejects.toBeDefined();
    await expect(api.createGoal({ name: "Past", targetAmount: 100, deadline: "2026-10-24" })).rejects.toBeDefined();
    const [mine] = await api.getMyGoals();
    controls.persona("steady-saver");
    await expect(api.getGoal(mine.id)).rejects.toMatchObject({ code: "not-found" });
    await expect(api.addContribution(mine.id, 100)).rejects.toMatchObject({ code: "not-found" });
  });
});

describe("getMyScore", () => {
  it("returns my score and reflects completed challenges", async () => {
    const { api } = setup();
    expect(await api.getMyScore()).toMatchObject({ userId: "mock-demo-hero", points: 280, streak: 4 });
    const [c] = (await api.getChallenges()).challenges;
    await api.completeChallenge(c.id);
    expect((await api.getMyScore())?.points).toBe(280 + c.points);
  });
});

describe("acceptChallenge", () => {
  it("marks a challenge accepted, keeps it open, and still allows completing it", async () => {
    const { api } = setup();
    const [c] = (await api.getChallenges()).challenges;
    expect((await api.acceptChallenge(c.id)).challenge.status).toBe("accepted");
    expect((await api.acceptChallenge(c.id)).challenge.status).toBe("accepted");
    expect((await api.getChallenges()).challenges.find((x) => x.id === c.id)?.status).toBe("accepted");
    expect((await api.completeChallenge(c.id)).challenge.status).toBe("completed");
    await expect(api.acceptChallenge(c.id)).rejects.toMatchObject({ code: "functions/not-found" });
  });
});

describe("safe-to-save history and balance", () => {
  it.each(PERSONAS.map((p) => p.id))("%s: 30 days ending at today's numbers, never negative", async (persona) => {
    const { api } = setup({ settings: { persona } });
    const res = await api.getSafeToSave();
    const history = res.history!;
    expect(history).toHaveLength(30);
    expect(history.at(-1)).toEqual({ date: "2026-10-24", amount: res.amount, balance: res.breakdown.currentBalance });
    expect(history.map((h) => h.date)).toEqual([...history.map((h) => h.date)].sort());
    expect(history.every((h) => h.amount >= 0 && h.balance >= 0)).toBe(true);
  });

  it("is stable across calls", async () => {
    const { api } = setup();
    expect((await api.getSafeToSave()).history).toEqual((await api.getSafeToSave()).history);
  });

  it("adding money to a goal lowers the balance and what's left over", async () => {
    const { api } = setup();
    const before = await api.getSafeToSave();
    const [goal] = await api.getMyGoals();
    await api.addContribution(goal.id, 5000);
    const after = await api.getSafeToSave();
    expect(after.breakdown.currentBalance).toBe(before.breakdown.currentBalance - 5000);
    expect(after.amount).toBe(before.amount - 5000);
  });
});
