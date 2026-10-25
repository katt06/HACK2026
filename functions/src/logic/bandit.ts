// Which challenges to show: Thompson sampling over (challenge type × difficulty) arms.
// Each arm's completion rate has a Beta posterior built from banditStats (see posterior() for the prior).
// We draw one sample per arm and show the highest draws, so arms that work for this user win more often
// while uncertain arms still get tried.
import { CHALLENGE_TYPES, type BanditStatsDoc, type ChallengeDoc, type ChallengeStatus, type ChallengeType, type Difficulty } from "../contract.js";
import type { Rng } from "./random.js";

export const DIFFICULTIES: readonly Difficulty[] = ["easy", "medium", "hard"];
export const CHALLENGE_TTL_DAYS = 7; // left open (offered or accepted) longer than this = expired, a failure
export const OPEN_STATUSES: readonly ChallengeStatus[] = ["active", "accepted"];

export type ArmKey = `${ChallengeType}_${Difficulty}`;
export type ArmStats = Pick<BanditStatsDoc, "attempts" | "completions">;

export const armKey = (arm: { type: ChallengeType; difficulty: Difficulty }): ArmKey => `${arm.type}_${arm.difficulty}`;

export function allArms(): { type: ChallengeType; difficulty: Difficulty }[] {
  return CHALLENGE_TYPES.flatMap((type) => DIFFICULTIES.map((difficulty) => ({ type, difficulty })));
}

export function statsByArm(stats: BanditStatsDoc[]): Map<ArmKey, ArmStats> {
  return new Map(stats.map((s) => [armKey({ type: s.challengeType, difficulty: s.difficulty }), s]));
}

// ---------- Sampling ----------

// Standard normal via Box–Muller.
function sampleNormal(rng: Rng): number {
  const u = 1 - rng(); // (0, 1], so log is finite
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
}

// Gamma(shape, 1) by Marsaglia–Tsang; shapes below 1 use the boost trick.
export function sampleGamma(shape: number, rng: Rng): number {
  if (shape < 1) return sampleGamma(shape + 1, rng) * Math.pow(1 - rng(), 1 / shape);
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x: number;
    let v: number;
    do {
      x = sampleNormal(rng);
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = 1 - rng();
    if (Math.log(u) < 0.5 * x * x + d - d * v + d * Math.log(v)) return d * v;
  }
}

export function sampleBeta(alpha: number, beta: number, rng: Rng): number {
  const x = sampleGamma(alpha, rng);
  return x / (x + sampleGamma(beta, rng));
}

// How much the shared evidence counts, in "virtual attempts" (chosen by scripts/simulateBandit.ts).
export const PRIOR_STRENGTH = 4;

// Arms share evidence: someone who finishes "cook at home, easy" probably finishes "cook at home, medium".
// Each arm's prior is centered on this user's completion rate for its type and for its difficulty
// (each itself Beta(1,1)-smoothed), worth PRIOR_STRENGTH attempts; the arm's own results add on top.
// With 18 arms and only a few challenges a week, this learns much faster than independent arms.
export function posterior(byArm: Map<ArmKey, ArmStats>, arm: { type: ChallengeType; difficulty: Difficulty }): { alpha: number; beta: number } {
  let typeDone = 0;
  let typeTried = 0;
  let levelDone = 0;
  let levelTried = 0;
  for (const other of allArms()) {
    const s = byArm.get(armKey(other));
    if (!s) continue;
    if (other.type === arm.type) {
      typeDone += s.completions;
      typeTried += s.attempts;
    }
    if (other.difficulty === arm.difficulty) {
      levelDone += s.completions;
      levelTried += s.attempts;
    }
  }
  const priorMean = ((1 + typeDone) / (2 + typeTried) + (1 + levelDone) / (2 + levelTried)) / 2;
  const own = byArm.get(armKey(arm));
  const completions = own?.completions ?? 0;
  const failures = Math.max(0, (own?.attempts ?? 0) - completions);
  return { alpha: PRIOR_STRENGTH * priorMean + completions, beta: PRIOR_STRENGTH * (1 - priorMean) + failures };
}

// ---------- Choosing ----------

// One posterior draw per distinct arm among the candidates, then the highest draws win.
// Prefers different challenge types so the three cards aren't all variations of one idea.
export function pickChallenges<T extends { type: ChallengeType; difficulty: Difficulty }>(
  candidates: T[],
  stats: BanditStatsDoc[],
  count: number,
  rng: Rng = Math.random,
): T[] {
  const byArm = statsByArm(stats);
  const draws = new Map<ArmKey, number>();
  for (const c of candidates) {
    const key = armKey(c);
    if (!draws.has(key)) {
      const { alpha, beta } = posterior(byArm, c);
      draws.set(key, sampleBeta(alpha, beta, rng));
    }
  }
  const ranked = candidates.map((c, i) => ({ c, i, draw: draws.get(armKey(c))! })).sort((a, b) => b.draw - a.draw || a.i - b.i);

  const picked: T[] = [];
  const types = new Set<ChallengeType>();
  const arms = new Set<ArmKey>();
  for (const { c } of ranked) {
    if (picked.length < count && !types.has(c.type)) {
      picked.push(c);
      types.add(c.type);
      arms.add(armKey(c));
    }
  }
  for (const { c } of ranked) {
    if (picked.length < count && !arms.has(armKey(c))) {
      picked.push(c);
      arms.add(armKey(c));
    }
  }
  return picked;
}

// ---------- Outcomes ----------

export function updateStats(stats: ArmStats | undefined, success: boolean): ArmStats {
  return { attempts: (stats?.attempts ?? 0) + 1, completions: (stats?.completions ?? 0) + (success ? 1 : 0) };
}

export type ChallengeEvent = "accept" | "complete" | "expire";

// How an event changes the arm's stats, given the challenge's status before it. Every offer ends up
// counting exactly one attempt: when accepted, or when completed/expired without having been accepted.
export function statsDelta(before: ChallengeStatus, event: ChallengeEvent): ArmStats {
  const countsAttempt = before === "active" ? 1 : 0; // accepting already counted it
  if (event === "accept") return { attempts: countsAttempt, completions: 0 };
  if (event === "complete") return { attempts: countsAttempt, completions: 1 };
  return { attempts: countsAttempt, completions: 0 };
}

export function isExpired(challenge: Pick<ChallengeDoc, "status" | "createdAt">, now: Date): boolean {
  return OPEN_STATUSES.includes(challenge.status) && now.getTime() - Date.parse(challenge.createdAt) > CHALLENGE_TTL_DAYS * 86_400_000;
}

export function banditStatsId(uid: string, arm: { type: ChallengeType; difficulty: Difficulty }): string {
  return `${uid}_${arm.type}_${arm.difficulty}`;
}
