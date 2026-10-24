import { describe, expect, it } from "vitest";
import { normalizeInviteCode, toGroupSummary } from "./groups.js";

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
