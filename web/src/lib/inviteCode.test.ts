import { describe, expect, it } from "vitest";
import { generateInviteCode, normalizeInviteCode } from "./inviteCode";

describe("generateInviteCode", () => {
  it("makes 6-character codes without look-alike characters", () => {
    for (let i = 0; i < 500; i++) {
      expect(generateInviteCode()).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
    }
  });
});

describe("normalizeInviteCode", () => {
  it("accepts messy input and rejects malformed codes", () => {
    expect(normalizeInviteCode(" sq-uad 7 ")).toBe("SQUAD7");
    expect(normalizeInviteCode("SQUAD")).toBeNull();
    expect(normalizeInviteCode("SQUAD0")).toBeNull();
  });
});
