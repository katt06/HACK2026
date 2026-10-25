import { describe, expect, it } from "vitest";
import { acceptChallengeStub, challengesStub, completeChallengeStub } from "./stubs.js";

describe("challengesStub", () => {
  it("assigns challenges to the caller", () => {
    const { challenges } = challengesStub("u1");
    expect(challenges.length).toBeGreaterThan(0);
    expect(challenges.every((c) => c.userId === "u1" && c.status === "active")).toBe(true);
  });
});

describe("acceptChallengeStub", () => {
  it("marks a known challenge accepted for the caller", () => {
    expect(acceptChallengeStub("u1", "stub-challenge-1")?.challenge).toMatchObject({ status: "accepted", userId: "u1" });
    expect(acceptChallengeStub("u1", "nope")).toBeNull();
  });
});

describe("completeChallengeStub", () => {
  it("completes a known challenge and awards its points", () => {
    const res = completeChallengeStub("u1", "stub-challenge-1");
    expect(res?.challenge.status).toBe("completed");
    expect(res?.pointsAwarded).toBe(res?.challenge.points);
    expect(res?.score.userId).toBe("u1");
  });

  it("returns null for an unknown id", () => {
    expect(completeChallengeStub("u1", "nope")).toBeNull();
  });
});
