// What the bandit has learned about a user, as short plain lines for Claude's prompt
// ("usually finishes easy challenges (5 of 6)"). Counts only: no money, no merchants.
import type { BanditStatsDoc, ChallengeType, Difficulty } from "../contract.js";

export const MIN_ATTEMPTS = 2; // below this, a rate says nothing
const USUALLY = 0.6;
const RARELY = 0.3;
const MAX_LINES = 4;

const TYPE_LABEL: Record<ChallengeType, string> = {
  no_spend_day: "no-spend day",
  cook_at_home: "cook-at-home",
  brew_at_home: "brew-at-home",
  category_cap: "category cap",
  subscription_review: "subscription review",
  transit_swap: "transit swap",
};

interface Tally {
  label: string;
  attempts: number;
  completions: number;
}

function tally<K extends string>(stats: BanditStatsDoc[], keyOf: (s: BanditStatsDoc) => K, label: (k: K) => string): Tally[] {
  const byKey = new Map<K, Tally>();
  for (const s of stats) {
    const k = keyOf(s);
    const t = byKey.get(k) ?? { label: label(k), attempts: 0, completions: 0 };
    t.attempts += s.attempts;
    t.completions += s.completions;
    byKey.set(k, t);
  }
  return [...byKey.values()];
}

// Strongest signals first (most attempts), only clear patterns, at most MAX_LINES.
export function describeWhatWorks(stats: BanditStatsDoc[]): string[] {
  const groups = [
    ...tally(stats, (s) => s.challengeType, (t: ChallengeType) => `${TYPE_LABEL[t]} challenges`),
    ...tally(stats, (s) => s.difficulty, (d: Difficulty) => `${d} challenges`),
  ];
  return groups
    .filter((g) => g.attempts >= MIN_ATTEMPTS)
    .map((g) => ({ ...g, rate: g.completions / g.attempts }))
    .filter((g) => g.rate >= USUALLY || g.rate <= RARELY)
    .sort((a, b) => b.attempts - a.attempts || a.label.localeCompare(b.label))
    .slice(0, MAX_LINES)
    .map((g) => `${g.rate >= USUALLY ? "usually finishes" : "rarely finishes"} ${g.label} (${g.completions} of ${g.attempts})`);
}
