import { describe, expect, it } from "vitest";
import { evaluateBadges, levelProgress, normalizeInviteCode, toGroupSummary } from "./contract.js";

describe("normalizeInviteCode", () => {
  it("uppercases and strips spaces and dashes", () => {
    expect(normalizeInviteCode(" sav-e24 ")).toBe("SAVE24");
  });

  it.each(["SAVE2", "SAVE245", "SAVEO2", "SAVE12", "SAVE!2", ""])("rejects %j", (raw) => {
    expect(normalizeInviteCode(raw)).toBeNull();
  });
});

describe("toGroupSummary", () => {
  it("lists members in join order, marks the viewer, and falls back when a name is missing", () => {
    const summary = toGroupSummary("g1", {
      name: "Roomies",
      inviteCode: "SAVE24",
      members: ["a", "b"],
      memberNames: { a: "Alice" },
    }, "b");
    expect(summary.members).toEqual([
      { userId: "a", displayName: "Alice", isMe: false },
      { userId: "b", displayName: "Member", isMe: true },
    ]);
  });
});

describe("levelProgress", () => {
  it("splits XP into level and progress", () => {
    expect(levelProgress(0)).toEqual({ level: 1, xpIntoLevel: 0, xpPerLevel: 100 });
    expect(levelProgress(280)).toEqual({ level: 3, xpIntoLevel: 80, xpPerLevel: 100 });
    expect(levelProgress(300)).toEqual({ level: 4, xpIntoLevel: 0, xpPerLevel: 100 });
    expect(levelProgress(-5).level).toBe(1);
  });
});

describe("evaluateBadges", () => {
  it("earns badges at their thresholds, in a fixed order", () => {
    const res = evaluateBadges({ goalsCreated: 1, streak: 3, challengesCompleted: 10 });
    expect(res.map((b) => [b.id, b.earned, b.progress])).toEqual([
      ["first-float", true, 1],
      ["chill-streak", false, 3],
      ["yuzu-master", true, 10],
    ]);
  });

  it("keeps a badge earned after the stat drops", () => {
    const res = evaluateBadges({ goalsCreated: 0, streak: 0, challengesCompleted: 0 }, ["chill-streak"]);
    expect(res.find((b) => b.id === "chill-streak")).toEqual({ id: "chill-streak", earned: true, progress: 4, goal: 4 });
  });
});
