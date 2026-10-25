// A7: how well does the challenge picker learn? Simulated users, the production picker, and baselines.
// Usage: npm run simulate  → scripts/out/banditSimulation.json (read by the /deck/bandit page)
//
// Each simulated user has a hidden completion rate for every (type × difficulty) arm. Every round (a week)
// each policy shows the user 3 cards, exactly like getChallenges, and the user finishes each one with its
// hidden probability. All policies see the same luck for the same arm in the same week (common random
// numbers), so differences come from the policy, not the dice.
//
// Rigor:
//   - SEEDS independent worlds of USERS users each; every number is a mean across seeds with a 95% CI (t).
//   - Regret = what the best possible 3 cards would have earned minus what the policy's cards earned, in
//     expected completions (the oracle follows the same "3 different types" rule as production).
//   - Two worlds: "structured" (tastes follow type and difficulty, the assumption behind the shared prior) and
//     "unstructured" (every arm independent), to show what the shared prior costs when that assumption fails.
//   - A sweep over PRIOR_STRENGTH, and the textbook independent-arms Thompson sampler as the key comparison.
import { mkdirSync, writeFileSync } from "node:fs";
import type { BanditStatsDoc, ChallengeType, Difficulty } from "../functions/src/contract.js";
import { DEFAULT_PRIOR, PRIOR_STRENGTH, allArms, armKey, pickChallenges, updateStats, type ArmKey, type ArmStats, type PriorOptions } from "../functions/src/logic/bandit.js";
import { mulberry32, type Rng } from "../functions/src/logic/random.js";

const SEEDS = 20;
const USERS = 100;
const ROUNDS = 52; // a year of weekly challenges
const CARDS = 3; // ACTIVE_CHALLENGES in getChallenges
const EPSILON = 0.1;
const STRENGTHS = [0.5, 1, 2, 4, 8, 16, 32, 64, 128];
const T_95 = 2.093; // two-sided t critical value, 19 degrees of freedom (SEEDS - 1)
const OUTPUT = "scripts/out/banditSimulation.json";

const ARMS = allArms();
const TYPES = [...new Set(ARMS.map((a) => a.type))];
type Arm = (typeof ARMS)[number];
type Stats = Map<ArmKey, ArmStats>;
type Rates = Map<ArmKey, number>;
type WorldName = "structured" | "unstructured";

// ---------- worlds ----------

const BASE_RATE: Record<Difficulty, number> = { easy: 0.5, medium: 0.35, hard: 0.2 };
const clampRate = (r: number) => Math.min(0.95, Math.max(0.02, r));

// Easier is likelier; each user loves one type and skips another; a little per-arm noise on top.
function structuredRates(rng: Rng): Rates {
  const favorite = TYPES[Math.floor(rng() * TYPES.length)];
  const disliked = TYPES.filter((t) => t !== favorite)[Math.floor(rng() * (TYPES.length - 1))];
  return new Map(
    ARMS.map((arm) => {
      let rate = BASE_RATE[arm.difficulty] + (rng() - 0.5) * 0.16;
      if (arm.type === favorite) rate += 0.35;
      if (arm.type === disliked) rate -= 0.15;
      return [armKey(arm), clampRate(rate)];
    }),
  );
}

// No shared structure: knowing one arm says nothing about another.
function unstructuredRates(rng: Rng): Rates {
  return new Map(ARMS.map((arm) => [armKey(arm), 0.05 + rng() * 0.75]));
}

const WORLDS: Record<WorldName, (rng: Rng) => Rates> = { structured: structuredRates, unstructured: unstructuredRates };

// ---------- policies ----------

// Highest-scoring arms first, preferring different types: the same rule pickChallenges uses.
function topDiverse(ranked: Arm[], count = CARDS): Arm[] {
  const picked: Arm[] = [];
  const types = new Set<ChallengeType>();
  for (const a of ranked) if (picked.length < count && !types.has(a.type)) picked.push(a), types.add(a.type);
  for (const a of ranked) if (picked.length < count && !picked.includes(a)) picked.push(a);
  return picked;
}

function shuffled<T>(xs: T[], rng: Rng): T[] {
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const toDocs = (stats: Stats): BanditStatsDoc[] =>
  ARMS.filter((a) => stats.has(armKey(a))).map((a) => ({ userId: "sim", challengeType: a.type, difficulty: a.difficulty, ...stats.get(armKey(a))! }));

type Policy = (stats: Stats, rates: Rates, rng: Rng) => Arm[];

const thompson = (prior: PriorOptions): Policy => (stats, _rates, rng) => pickChallenges(ARMS, toDocs(stats), CARDS, rng, prior);

const POLICIES: Record<string, Policy> = {
  // The exact function getChallenges calls, with the production prior.
  thompsonShared: thompson(DEFAULT_PRIOR),
  thompsonIndependent: thompson({ shared: false, strength: 0 }),
  // Each card: 10% a random arm, otherwise the best observed rate (untried arms count as 0, ties random).
  epsilonGreedy: (stats, _rates, rng) => {
    const rate = (a: Arm) => {
      const s = stats.get(armKey(a));
      return s && s.attempts > 0 ? s.completions / s.attempts : 0;
    };
    const ranked = shuffled(ARMS, rng).sort((a, b) => rate(b) - rate(a));
    return topDiverse(ranked).map((a, i, picked) => {
      if (rng() >= EPSILON) return a;
      const others = ARMS.filter((x) => !picked.includes(x));
      return others[Math.floor(rng() * others.length)] ?? a;
    });
  },
  random: (_s, _r, rng) => topDiverse(shuffled(ARMS, rng)),
  oracle: (_s, rates) => topDiverse([...ARMS].sort((a, b) => rates.get(armKey(b))! - rates.get(armKey(a))!)),
};

// ---------- simulation ----------

interface SeedResult {
  completion: number[]; // per round: mean share of the 3 cards finished, across users
  cumRegret: number[]; // per round: mean cumulative expected regret, in completions
}

function runSeed(world: WorldName, seed: number, policy: Policy): SeedResult {
  const worldRng = mulberry32(seed);
  const users = Array.from({ length: USERS }, () => ({
    rates: WORLDS[world](worldRng),
    luck: Array.from({ length: ROUNDS }, () => ARMS.map(() => worldRng())), // same dice for every policy
  }));
  const policyRng = mulberry32(seed * 7919 + 1);
  const completion = Array<number>(ROUNDS).fill(0);
  const cumRegret = Array<number>(ROUNDS).fill(0);

  for (const user of users) {
    const stats: Stats = new Map();
    const best = POLICIES.oracle(stats, user.rates, policyRng).reduce((s, a) => s + user.rates.get(armKey(a))!, 0);
    let regret = 0;
    for (let round = 0; round < ROUNDS; round++) {
      const cards = policy(stats, user.rates, policyRng);
      let done = 0;
      let expected = 0;
      for (const arm of cards) {
        const key = armKey(arm);
        const rate = user.rates.get(key)!;
        const finished = user.luck[round][ARMS.indexOf(arm)] < rate;
        stats.set(key, updateStats(stats.get(key), finished));
        done += finished ? 1 : 0;
        expected += rate;
      }
      regret += best - expected;
      completion[round] += done / CARDS / USERS;
      cumRegret[round] += regret / USERS;
    }
  }
  return { completion, cumRegret };
}

interface Interval {
  mean: number;
  lo: number;
  hi: number;
}

function interval(values: number[]): Interval {
  const n = values.length;
  const mean = values.reduce((s, v) => s + v, 0) / n;
  const sd = Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1));
  const half = (T_95 * sd) / Math.sqrt(n);
  return { mean: round3(mean), lo: round3(mean - half), hi: round3(mean + half) };
}

function round3(x: number): number {
  return Math.round(x * 1000) / 1000;
}

const seeds = Array.from({ length: SEEDS }, (_, i) => 2026 + i);

function runPolicy(world: WorldName, policy: Policy) {
  const results = seeds.map((s) => runSeed(world, s, policy));
  const perRound = (pick: (r: SeedResult) => number[]) => Array.from({ length: ROUNDS }, (_, i) => interval(results.map((r) => pick(r)[i])));
  const window = (from: number, to: number) => interval(results.map((r) => r.completion.slice(from, to).reduce((s, x) => s + x, 0) / (to - from)));
  return {
    completion: perRound((r) => r.completion),
    cumRegret: perRound((r) => r.cumRegret),
    summary: {
      first4Weeks: window(0, 4),
      last12Weeks: window(ROUNDS - 12, ROUNDS),
      year: window(0, ROUNDS),
      regretAt12: interval(results.map((r) => r.cumRegret[11])),
      regretAt52: interval(results.map((r) => r.cumRegret[ROUNDS - 1])),
    },
  };
}

function main() {
  const started = Date.now();
  const worlds = Object.fromEntries(
    (Object.keys(WORLDS) as WorldName[]).map((world) => {
      const policies = Object.fromEntries(Object.entries(POLICIES).map(([name, policy]) => [name, runPolicy(world, policy)]));
      console.log(`${world}: policies done (${((Date.now() - started) / 1000).toFixed(0)}s)`);
      return [world, policies];
    }),
  );

  const sweep = Object.fromEntries(
    (Object.keys(WORLDS) as WorldName[]).map((world) => [
      world,
      STRENGTHS.map((strength) => {
        const results = seeds.map((s) => runSeed(world, s, thompson({ shared: true, strength })));
        return {
          strength,
          regretAt12: interval(results.map((r) => r.cumRegret[11])),
          regretAt52: interval(results.map((r) => r.cumRegret[ROUNDS - 1])),
        };
      }),
    ]),
  );
  console.log(`sweep done (${((Date.now() - started) / 1000).toFixed(0)}s)`);

  // Headline numbers for the slide: the production picker vs. the textbook baseline, structured world.
  const s = worlds.structured as Record<string, ReturnType<typeof runPolicy>>;
  const u = worlds.unstructured as Record<string, ReturnType<typeof runPolicy>>;
  const cut = (a: Interval, b: Interval) => round3(1 - a.mean / b.mean);
  const bestStrength = (world: WorldName) => [...sweep[world]].sort((a, b) => a.regretAt52.mean - b.regretAt52.mean)[0].strength;
  const headline = {
    regretCutVsIndependentAt12: cut(s.thompsonShared.summary.regretAt12, s.thompsonIndependent.summary.regretAt12),
    regretCutVsIndependentAt52: cut(s.thompsonShared.summary.regretAt52, s.thompsonIndependent.summary.regretAt52),
    regretCutVsEpsilonAt52: cut(s.thompsonShared.summary.regretAt52, s.epsilonGreedy.summary.regretAt52),
    unstructuredCostAt52: round3(u.thompsonShared.summary.regretAt52.mean / u.thompsonIndependent.summary.regretAt52.mean - 1),
    bestStrengthStructured: bestStrength("structured"),
    bestStrengthUnstructured: bestStrength("unstructured"),
    productionStrength: PRIOR_STRENGTH,
  };

  const result = {
    config: { seeds: SEEDS, usersPerSeed: USERS, rounds: ROUNDS, cardsPerRound: CARDS, arms: ARMS.length, epsilon: EPSILON, strengths: STRENGTHS, ci: "95% t-interval across seeds" },
    headline,
    worlds,
    sweep,
  };
  mkdirSync("scripts/out", { recursive: true });
  writeFileSync(OUTPUT, JSON.stringify(result) + "\n");
  console.log(`→ ${OUTPUT} in ${((Date.now() - started) / 1000).toFixed(0)}s`);
  console.table(Object.fromEntries(Object.entries(s).map(([name, p]) => [name, { year: p.summary.year.mean, last12: p.summary.last12Weeks.mean, regret12: p.summary.regretAt12.mean, regret52: p.summary.regretAt52.mean }])));
  console.log("headline", headline);
}

main();
