import { describe, expect, it } from "vitest";
import { normalizeInviteCode } from "@contract";
import { generateInviteCode } from "./inviteCode";

describe("generateInviteCode", () => {
  it("makes well-formed codes", () => {
    for (let i = 0; i < 500; i++) {
      const code = generateInviteCode();
      expect(normalizeInviteCode(code)).toBe(code);
    }
  });
});
