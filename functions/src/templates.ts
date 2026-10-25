// Fallback challenges for when the LLM is rate-limited, unavailable, or returns nothing usable.
// One per (type, difficulty), so the bandit always has every arm to choose from.
import { CHALLENGE_POINTS, CHALLENGE_TYPES, type Category, type ChallengeType, type Difficulty } from "./contract.js";
import type { ChallengeCandidate } from "./logic/challengeRules.js";
import { formatDollars } from "./logic/money.js";
import { categoryLabel, describeChange, topRisingTrend, type SpendingSummary } from "./logic/spendingSummary.js";

const DESCRIPTIONS: Record<ChallengeType, Record<Difficulty, string>> = {
  no_spend_day: {
    easy: "Pick one day this week with no non-essential spending.",
    medium: "Have two no-spend days this week.",
    hard: "Have three no-spend days this week.",
  },
  cook_at_home: {
    easy: "Cook dinner at home two nights this week instead of ordering in.",
    medium: "Cook at home four nights this week.",
    hard: "Go the whole week without takeout or delivery.",
  },
  brew_at_home: {
    easy: "Make coffee at home three mornings this week.",
    medium: "Make coffee at home five mornings this week.",
    hard: "Make all your coffee at home for a full week.",
  },
  category_cap: {
    easy: "Keep {category} about 10% below your usual week.",
    medium: "Keep {category} about 25% below your usual week.",
    hard: "Keep {category} about 40% below your usual week.",
  },
  subscription_review: {
    easy: "List every subscription you pay for and when each one renews.",
    medium: "Pause one subscription you haven't used this month.",
    hard: "Cancel two subscriptions you can live without.",
  },
  transit_swap: {
    easy: "Walk, bike, or take transit for one trip you'd usually drive.",
    medium: "Swap three car or ride-share trips for transit or walking.",
    hard: "Go a whole weekend without driving or ride-shares.",
  },
};

const DEFAULT_REASONS: Record<ChallengeType, string> = {
  no_spend_day: "A no-spend day is a quick way to see where the small purchases go.",
  cook_at_home: "Cooking at home is one of the easiest ways to free up money for your goal.",
  brew_at_home: "Small daily purchases add up faster than they feel.",
  category_cap: "A simple cap makes it easy to notice spending before it happens.",
  subscription_review: "Subscriptions are easy to forget once they're set up.",
  transit_swap: "Short trips are often the easiest to swap.",
};

// Which spending category each challenge type speaks to, for a reason grounded in the user's own numbers.
const RELATED_CATEGORY: Partial<Record<ChallengeType, Category>> = {
  cook_at_home: "delivery",
  brew_at_home: "coffee",
  transit_swap: "transport",
};

function reasonFor(type: ChallengeType, summary: SpendingSummary | undefined, capCategory: Category | null): string {
  if (!summary) return DEFAULT_REASONS[type];
  if (type === "subscription_review" && summary.subscriptionCount >= 3) {
    return `You have ${summary.subscriptionCount} recurring subscriptions, and they're easy to forget about.`;
  }
  const category = type === "category_cap" ? capCategory : RELATED_CATEGORY[type];
  const trend = summary.trends.find((t) => t.category === category && t.last30Days > 0);
  if (!trend) return DEFAULT_REASONS[type];
  const label = categoryLabel(trend.category);
  const fact = `${label.charAt(0).toUpperCase()}${label.slice(1)} was ${formatDollars(trend.last30Days)} in the last 30 days, ${describeChange(trend.changePct)}.`;
  return trend.changePct !== null && trend.changePct <= -5 ? `${fact} Nice work, this keeps it going.` : fact;
}

export function templateCandidates(summary?: SpendingSummary): ChallengeCandidate[] {
  // Cap whichever flexible category is growing fastest; dining out if nothing stands out.
  const capCategory = summary ? (topRisingTrend(summary)?.category ?? null) : null;
  return CHALLENGE_TYPES.flatMap((type) =>
    (["easy", "medium", "hard"] as const).map((difficulty) => ({
      type,
      difficulty,
      description: DESCRIPTIONS[type][difficulty].replace("{category}", categoryLabel(capCategory ?? "dining")),
      reason: reasonFor(type, summary, capCategory),
      points: CHALLENGE_POINTS[difficulty],
      source: "template" as const,
    })),
  );
}
