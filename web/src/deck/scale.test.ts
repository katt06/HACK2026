import { describe, expect, it } from "vitest";
import { bandPath, linePath, niceTicks } from "./scale";

describe("niceTicks", () => {
  it("starts at 0 and uses round steps that cover the max", () => {
    expect(niceTicks(39.7)).toEqual([0, 10, 20, 30, 40]);
    expect(niceTicks(0.64)).toEqual([0, 0.2, 0.4, 0.6, 0.8]);
    expect(niceTicks(22)).toEqual([0, 10, 20, 30]);
    expect(niceTicks(0)).toEqual([0]);
  });
});

describe("paths", () => {
  it("draws lines and closed bands", () => {
    expect(linePath([[0, 1], [2, 3]])).toBe("M0.0,1.0L2.0,3.0");
    expect(bandPath([[0, 1], [2, 1]], [[0, 5], [2, 5]])).toBe("M0.0,1.0L2.0,1.0L2.0,5.0L0.0,5.0Z");
  });
});
