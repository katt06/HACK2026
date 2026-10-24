import { describe, expect, it } from "vitest";
import { parseDollars } from "./format";

describe("parseDollars", () => {
  it.each([["1,200.50", 120050], ["$40", 4000], [" 0.99 ", 99], ["19.9", 1990]])("%j → %i", (input, cents) => {
    expect(parseDollars(input)).toBe(cents);
  });

  it.each(["", "-5", "abc", "1.234", "1.2.3"])("rejects %j", (input) => {
    expect(parseDollars(input)).toBeNull();
  });
});
