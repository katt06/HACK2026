import { describe, expect, it } from "vitest";
import { CALLABLES } from "./contract.js";

describe("contract", () => {
  it("exposes the health callable name", () => {
    expect(CALLABLES.health).toBe("health");
  });
});
