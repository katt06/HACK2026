// Compares Thompson sampling (what getChallenges uses) with an epsilon-greedy baseline on simulated users.
// Usage: npm run simulate  → scripts/out/banditSimulation.json (per-round completion rates, for a chart)
//
// Each simulated user has a hidden completion rate per (type × difficulty) arm: easier is likelier, plus a
// favorite type they love and one they skip. Every round each policy shows each user one challenge.
// All policies face the same random outcomes (common random numbers), so differences come from the policy.
import { mkdirSync, writeFileSync } from "node:fs";
import type { BanditStatsDoc, Difficulty } from "../functions/src/contract.js";
import { allArms, armKey, pickChallenges, updateStats, type ArmKey, type ArmStats } from "../functions/src/logic/bandit.js";
import { mulberry32, type Rng } from "../functions/src/logic/random.js";

const SEED = 2026;
const USERS = 300;
const ROUNDS = 50;
const EPSILON = 0.1;
const OUTPUT = "scripts/out/banditSimulation.json";

const ARMS = allArms();
const BASE_RATE: Record<Difficulty, number> = { easy: 0.5, medium: 0.35, hard: 0.2 };
const FAVORITE_BONUS = 0.35;
const DISLIKED_PENALTY = 0.15;

type Arm = (typeof ARMS)[number];
type Stats = Map<ArmKey, ArmStats>;

function hiddenRates(rng: Rng): Map<ArmKey, number> {
  const types = [...new Set(ARMS.map((a) => a.type))];
  const favorite = types[Math.floor(rng() * types.length)];
  const disliked = types.filter((t) => t !== favorite)[Math.floor(rng() * (types.length - 1))];
  return new Map(
    ARMS.map((arm) => {
      let rate = BASE_RATE[arm.difficulty] + (rng() - 0.5) * 0.16;
      if (arm.type === favorite) rate += FAVORITE_BONUS;
      if (arm.type === disliked) rate -= DISLIKED_PENALTY;
      return [armKey(arm), Math.min(0.95, Math.max(0.02, rate))];
    }),
  );
}

interface Policy {
  name: string;
  choose(stats: Stats, rates: Map<ArmKey, number>, rng: Rng): Arm;
}

const randomArm = (rng: Rng) => ARMS[Math.floor(rng() * ARMS.length)];

const policies: Policy[] = [
  {
    name: "thompson",
    // The exact function getChallenges uses, asked for one challenge.
    choose(stats, _rates, rng) {
      const docs: BanditStatsDoc[] = ARMS.filter((a) => stats.has(armKey(a))).map((a) => ({
        userId: "sim",
        challengeType: a.type,
        difficulty: a.difficulty,
        ...stats.get(armKey(a))!,
      }));
      return pickChallenges(ARMS, docs, 1, rng)[0];
    },
  },
  {
    name: "epsilonGreedy",
    // Explore at random 10% of the time; otherwise the best observed rate (untried arms count as 0).
    choose(stats, _rates, rng) {
      if (rng() < EPSILON) return randomArm(rng);
      const rate = (a: Arm) => {
        const s = stats.get(armKey(a));
        return s && s.attempts > 0 ? s.completions / s.attempts : 0;
      };
      const best = Math.max(...ARMS.map(rate));
      const tied = ARMS.filter((a) => rate(a) === best);
      return tied[Math.floor(rng() * tied.length)];
    },
  },
  { name: "random", choose: (_s, _r, rng) => randomArm(rng) },
  {
    name: "oracle", // knows the hidden rates: the best any policy could do
    choose: (_s, rates) => ARMS.reduce((best, a) => (rates.get(armKey(a))! > rates.get(armKey(best))! ? a : best)),
  },
];

function simulate() {
  const worldRng = mulberry32(SEED);
  const users = Array.from({ length: USERS }, () => ({
    rates: hiddenRates(worldRng),
    luck: Array.from({ length: ROUNDS }, () => worldRng()), // shared outcome draws
  }));

  const completionsByPolicy = new Map(policies.map((p) => [p.name, Array<number>(ROUNDS).fill(0)]));
  policies.forEach((policy, p) => {
    const rng = mulberry32(SEED + 1 + p);
    for (const user of users) {
      const stats: Stats = new Map();
      for (let round = 0; round < ROUNDS; round++) {
        const arm = policy.choose(stats, user.rates, rng);
        const completed = user.luck[round] < user.rates.get(armKey(arm))!;
        stats.set(armKey(arm), updateStats(stats.get(armKey(arm)), completed));
        if (completed) completionsByPolicy.get(policy.name)![round]++;
      }
    }
  });

  const rounds = Array.from({ length: ROUNDS }, (_, i) => ({
    round: i + 1,
    ...Object.fromEntries(policies.map((p) => [p.name, round3(completionsByPolicy.get(p.name)![i] / USERS)])),
  }));
  const average = (name: string, from: number, to: number) =>
    round3(completionsByPolicy.get(name)!.slice(from, to).reduce((s, n) => s + n, 0) / ((to - from) * USERS));
  const summary = Object.fromEntries(
    policies.map((p) => [p.name, { first10: average(p.name, 0, 10), last10: average(p.name, ROUNDS - 10, ROUNDS), overall: average(p.name, 0, ROUNDS) }]),
  );
  return { config: { seed: SEED, users: USERS, rounds: ROUNDS, arms: ARMS.length, epsilon: EPSILON }, summary, rounds };
}

function round3(x: number): number {
  return Math.round(x * 1000) / 1000;
}

const result = simulate();
mkdirSync("scripts/out", { recursive: true });
writeFileSync(OUTPUT, JSON.stringify(result, null, 2) + "\n");
console.log(`Completion rate per round, ${USERS} simulated users, ${ROUNDS} rounds → ${OUTPUT}`);
console.table(result.summary);
