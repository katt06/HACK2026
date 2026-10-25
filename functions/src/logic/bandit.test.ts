import { describe, expect, it } from "vitest";
import type { BanditStatsDoc, ChallengeType, Difficulty } from "../contract.js";
import { templateCandidates } from "../templates.js";
import { allArms, armKey, banditStatsId, isExpired, pickChallenges, posterior, PRIOR_STRENGTH, sampleBeta, sampleGamma, statsByArm, updateStats } from "./bandit.js";
import { mulberry32 } from "./random.js";

const stat = (type: ChallengeType, difficulty: Difficulty, attempts: number, completions: number): BanditStatsDoc => ({
  userId: "u1",
  challengeType: type,
  difficulty,
  attempts,
  completions,
});

const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;

describe("sampling", () => {
  it("Gamma and Beta draws have the right means", () => {
    const rng = mulberry32(7);
    expect(mean(Array.from({ length: 20000 }, () => sampleGamma(3, rng)))).toBeCloseTo(3, 1);
    expect(mean(Array.from({ length: 20000 }, () => sampleGamma(0.5, rng)))).toBeCloseTo(0.5, 1);
    expect(mean(Array.from({ length: 20000 }, () => sampleBeta(2, 6, rng)))).toBeCloseTo(0.25, 2);
    expect(Array.from({ length: 1000 }, () => sampleBeta(1, 1, rng)).every((x) => x > 0 && x < 1)).toBe(true);
  });

  it("starts every arm at an even prior worth PRIOR_STRENGTH attempts", () => {
    expect(posterior(new Map(), { type: "cook_at_home", difficulty: "easy" })).toEqual({ alpha: PRIOR_STRENGTH / 2, beta: PRIOR_STRENGTH / 2 });
  });

  it("adds the arm's own results on top of the shared prior", () => {
    const byArm = statsByArm([stat("cook_at_home", "easy", 10, 7)]);
    const { alpha, beta } = posterior(byArm, { type: "cook_at_home", difficulty: "easy" });
    expect(alpha + beta).toBeCloseTo(PRIOR_STRENGTH + 10);
    expect(alpha / (alpha + beta)).toBeGreaterThan(0.6);
  });

  it("shares evidence with arms of the same type or difficulty, not unrelated ones", () => {
    const byArm = statsByArm([stat("cook_at_home", "easy", 10, 10)]);
    const meanOf = (type: ChallengeType, difficulty: Difficulty) => {
      const p = posterior(byArm, { type, difficulty });
      return p.alpha / (p.alpha + p.beta);
    };
    expect(meanOf("cook_at_home", "hard")).toBeGreaterThan(0.6); // same type
    expect(meanOf("brew_at_home", "easy")).toBeGreaterThan(0.6); // same difficulty
    expect(meanOf("brew_at_home", "hard")).toBeCloseTo(0.5); // unrelated
  });
});

describe("pickChallenges", () => {
  const candidates = templateCandidates();

  it("returns the requested count with different types, deterministically for a seeded rng", () => {
    const picks = pickChallenges(candidates, [], 3, mulberry32(1));
    expect(picks).toHaveLength(3);
    expect(new Set(picks.map((p) => p.type)).size).toBe(3);
    expect(pickChallenges(candidates, [], 3, mulberry32(1))).toEqual(picks);
    expect(pickChallenges(candidates.slice(0, 2), [], 3)).toHaveLength(2);
  });

  it("favors arms this user completes and avoids ones they ignore", () => {
    const stats = [stat("brew_at_home", "easy", 20, 19), stat("no_spend_day", "hard", 20, 0)];
    const rng = mulberry32(3);
    const counts = new Map<string, number>();
    for (let i = 0; i < 500; i++) {
      for (const p of pickChallenges(candidates, stats, 1, rng)) counts.set(armKey(p), (counts.get(armKey(p)) ?? 0) + 1);
    }
    // 16 arms are still untried (uniformly uncertain), so Thompson keeps exploring them; the proven arm
    // still wins far more than its share (500 / 18 ≈ 28) and more than any other arm.
    const best = counts.get("brew_at_home_easy")!;
    expect(best).toBeGreaterThan(4 * (500 / allArms().length));
    expect(Math.max(...[...counts].filter(([k]) => k !== "brew_at_home_easy").map(([, n]) => n))).toBeLessThan(best);
    expect(counts.get("no_spend_day_hard") ?? 0).toBeLessThan(5);
  });

  it("still explores: with no history every arm gets picked sometimes", () => {
    const rng = mulberry32(4);
    const seen = new Set<string>();
    for (let i = 0; i < 400; i++) for (const p of pickChallenges(candidates, [], 1, rng)) seen.add(armKey(p));
    expect(seen.size).toBe(allArms().length);
  });
});

describe("outcomes", () => {
  it("counts attempts and completions", () => {
    expect(updateStats(undefined, true)).toEqual({ attempts: 1, completions: 1 });
    expect(updateStats({ attempts: 3, completions: 1 }, false)).toEqual({ attempts: 4, completions: 1 });
  });

  it("expires active challenges older than a week", () => {
    const now = new Date("2026-10-24T12:00:00.000Z");
    expect(isExpired({ status: "active", createdAt: "2026-10-17T11:00:00.000Z" }, now)).toBe(true);
    expect(isExpired({ status: "active", createdAt: "2026-10-18T12:00:00.000Z" }, now)).toBe(false);
    expect(isExpired({ status: "completed", createdAt: "2026-01-01T00:00:00.000Z" }, now)).toBe(false);
  });

  it("uses the uid_type_difficulty doc id from the data model", () => {
    expect(banditStatsId("demo-hero", { type: "brew_at_home", difficulty: "easy" })).toBe("demo-hero_brew_at_home_easy");
  });
});
