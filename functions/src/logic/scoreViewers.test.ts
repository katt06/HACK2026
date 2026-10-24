import { describe, expect, it } from "vitest";
import { scoreViewersFor } from "./scoreViewers.js";

describe("scoreViewersFor", () => {
  it("unions members across the user's groups, excluding the user", () => {
    const groups = [{ members: ["a", "b", "c"] }, { members: ["a", "d"] }, { members: ["x", "y"] }];
    expect(scoreViewersFor("a", groups)).toEqual(["b", "c", "d"]);
    expect(scoreViewersFor("d", groups)).toEqual(["a"]);
  });

  it("is empty for someone in no groups or alone in one", () => {
    expect(scoreViewersFor("z", [{ members: ["a"] }])).toEqual([]);
    expect(scoreViewersFor("a", [{ members: ["a"] }])).toEqual([]);
  });
});
