// Seed data for the mock API: one persona per demo story.
// Money is in cents and dates are relative to "today" so the demo never goes stale.
import type { Cents, ChallengeDoc, ScoreDoc } from "@contract";

export type PersonaId = "delivery-spender" | "irregular-income" | "subscription-creep" | "steady-saver" | "demo-hero";

export type ChallengeSeed = Pick<ChallengeDoc, "type" | "description" | "points" | "difficulty" | "reason">;

export interface Persona {
  id: PersonaId;
  story: string;
  displayName: string;
  currentBalance: Cents;
  bills: { merchant: string; amount: Cents; dueInDays: number }[]; // all due before payday
  projectedSpending: Cents;
  safetyBuffer: Cents;
  paydayInDays: number;
  insight: string; // story-specific line added to the safe-to-save explanation
  score: Omit<ScoreDoc, "userId" | "level">; // level is derived from points
  challenges: ChallengeSeed[]; // first 3 start active; the rest refill as challenges are completed
}

export const DEFAULT_PERSONA: PersonaId = "demo-hero";

export const MOCK_GROUP = { name: "Demo Squad", inviteCode: "DEMO42" };

export const POINTS = { easy: 30, medium: 50, hard: 80 } as const;

export const PERSONAS: Persona[] = [
  {
    id: "delivery-spender",
    story: "Delivery Spender",
    displayName: "Jordan",
    currentBalance: 185000,
    bills: [
      { merchant: "Rent", amount: 110000, dueInDays: 3 },
      { merchant: "Phone", amount: 6500, dueInDays: 5 },
    ],
    projectedSpending: 42000,
    safetyBuffer: 5000,
    paydayInDays: 7,
    insight: "Food delivery has averaged about $95 a week lately, so the forecast leaves room for it for now.",
    score: { goalProgressPct: 31, streak: 2, improvementScore: 44, points: 240 },
    challenges: [
      {
        type: "cook_at_home",
        difficulty: "easy",
        points: POINTS.easy,
        description: "Cook dinner at home two nights this week instead of ordering in.",
        reason: "Delivery apps were your biggest flexible category last month.",
      },
      {
        type: "category_cap",
        difficulty: "medium",
        points: POINTS.medium,
        description: "Keep food delivery under $60 this week.",
        reason: "You averaged about $95 a week on delivery over the last month.",
      },
      {
        type: "no_spend_day",
        difficulty: "medium",
        points: POINTS.medium,
        description: "Pick one day this week with no delivery or takeout orders.",
        reason: "Most of your orders land on weeknights, so one quiet night adds up.",
      },
      {
        type: "cook_at_home",
        difficulty: "hard",
        points: POINTS.hard,
        description: "Meal-prep lunches for the whole work week.",
        reason: "You've done two cook-at-home challenges, so here's a bigger one.",
      },
      {
        type: "brew_at_home",
        difficulty: "easy",
        points: POINTS.easy,
        description: "Make coffee at home three mornings this week.",
        reason: "Coffee orders often get bundled into delivery fees.",
      },
    ],
  },
  {
    id: "irregular-income",
    story: "Irregular Income",
    displayName: "Riley",
    currentBalance: 230000,
    bills: [
      { merchant: "Rent", amount: 95000, dueInDays: 4 },
      { merchant: "Car insurance", amount: 14000, dueInDays: 6 },
    ],
    projectedSpending: 30000,
    safetyBuffer: 40000,
    paydayInDays: 9,
    insight: "Your income has varied a lot lately, so we use a bigger cushion and assume your next payment arrives on the late side.",
    score: { goalProgressPct: 48, streak: 5, improvementScore: 61, points: 300 },
    challenges: [
      {
        type: "no_spend_day",
        difficulty: "easy",
        points: POINTS.easy,
        description: "Have one no-spend day before your next payment arrives.",
        reason: "Slower weeks are easier when you have some extra room.",
      },
      {
        type: "transit_swap",
        difficulty: "medium",
        points: POINTS.medium,
        description: "Swap two rideshare trips for transit or biking this week.",
        reason: "Rideshare was up about 30% compared to your usual month.",
      },
      {
        type: "category_cap",
        difficulty: "hard",
        points: POINTS.hard,
        description: "Keep shopping under $40 until your next payment.",
        reason: "Shopping tends to spike right after a big payment lands.",
      },
      {
        type: "subscription_review",
        difficulty: "easy",
        points: POINTS.easy,
        description: "Check your subscriptions and note any renewal dates this month.",
        reason: "Knowing what's coming helps in months when income is lighter.",
      },
      {
        type: "brew_at_home",
        difficulty: "easy",
        points: POINTS.easy,
        description: "Make coffee at home four mornings this week.",
        reason: "Small daily wins keep your streak alive between payments.",
      },
    ],
  },
  {
    id: "subscription-creep",
    story: "Subscription Creep",
    displayName: "Sam",
    currentBalance: 148000,
    bills: [
      { merchant: "Rent", amount: 80000, dueInDays: 2 },
      { merchant: "Netflix", amount: 1549, dueInDays: 1 },
      { merchant: "Spotify", amount: 1199, dueInDays: 3 },
      { merchant: "Hulu", amount: 1799, dueInDays: 4 },
      { merchant: "Max", amount: 1699, dueInDays: 5 },
      { merchant: "Adobe", amount: 2299, dueInDays: 6 },
      { merchant: "Gym", amount: 4500, dueInDays: 8 },
      { merchant: "iCloud", amount: 299, dueInDays: 9 },
    ],
    projectedSpending: 26000,
    safetyBuffer: 5000,
    paydayInDays: 10,
    insight: "Subscriptions now cost about $133 a month, up from $48 a year ago.",
    score: { goalProgressPct: 22, streak: 1, improvementScore: 38, points: 180 },
    challenges: [
      {
        type: "subscription_review",
        difficulty: "easy",
        points: POINTS.easy,
        description: "List every subscription you pay for and star the ones you used this week.",
        reason: "You have 7 recurring charges, and 3 started in the last 6 months.",
      },
      {
        type: "subscription_review",
        difficulty: "medium",
        points: POINTS.medium,
        description: "Pause or cancel one streaming service you haven't opened this month.",
        reason: "You pay for 4 streaming services at once.",
      },
      {
        type: "category_cap",
        difficulty: "hard",
        points: POINTS.hard,
        description: "Don't start any new free trials or subscriptions for two weeks.",
        reason: "Most of your new subscriptions started as free trials.",
      },
      {
        type: "no_spend_day",
        difficulty: "easy",
        points: POINTS.easy,
        description: "Have one no-spend day this week.",
        reason: "A quick win while you sort out subscriptions.",
      },
      {
        type: "subscription_review",
        difficulty: "hard",
        points: POINTS.hard,
        description: "Switch one subscription from monthly to annual billing, or drop it.",
        reason: "Annual plans for the services you keep could save about 15%.",
      },
    ],
  },
  {
    id: "steady-saver",
    story: "Steady Saver",
    displayName: "Priya",
    currentBalance: 340000,
    bills: [
      { merchant: "Rent", amount: 140000, dueInDays: 5 },
      { merchant: "Utilities", amount: 8500, dueInDays: 6 },
    ],
    projectedSpending: 35000,
    safetyBuffer: 10000,
    paydayInDays: 7,
    insight: "You've stayed under your usual spending six weeks in a row. Nice work.",
    score: { goalProgressPct: 74, streak: 12, improvementScore: 82, points: 620 },
    challenges: [
      {
        type: "no_spend_day",
        difficulty: "hard",
        points: POINTS.hard,
        description: "Do two no-spend days this week.",
        reason: "You've finished every medium challenge this month. Time to level up.",
      },
      {
        type: "transit_swap",
        difficulty: "medium",
        points: POINTS.medium,
        description: "Bike or walk for three short trips this week.",
        reason: "A few of your trips each week are under two miles.",
      },
      {
        type: "category_cap",
        difficulty: "medium",
        points: POINTS.medium,
        description: "Keep entertainment under $50 this week.",
        reason: "Entertainment is the one category that's crept up lately.",
      },
      {
        type: "brew_at_home",
        difficulty: "easy",
        points: POINTS.easy,
        description: "Make coffee at home every weekday.",
        reason: "An easy one to keep your 12-day streak going.",
      },
      {
        type: "subscription_review",
        difficulty: "medium",
        points: POINTS.medium,
        description: "Review your subscriptions before the end of the month.",
        reason: "A quick check-in keeps a good habit going.",
      },
    ],
  },
  {
    // Starts with 280 pts, right behind Riley (300) and just under level 4 (300).
    // Completing the easy challenge on stage moves Alex up a rank and a level.
    id: "demo-hero",
    story: "Demo Hero",
    displayName: "Alex",
    currentBalance: 124000,
    bills: [
      { merchant: "Rent", amount: 90000, dueInDays: 4 },
      { merchant: "Spotify", amount: 1099, dueInDays: 5 },
    ],
    projectedSpending: 21000,
    safetyBuffer: 3500,
    paydayInDays: 6,
    insight: "Coffee shops were about $48 last week, so today's challenge targets that.",
    score: { goalProgressPct: 42, streak: 4, improvementScore: 63, points: 280 },
    challenges: [
      {
        type: "brew_at_home",
        difficulty: "easy",
        points: POINTS.easy,
        description: "Make coffee at home three mornings this week.",
        reason: "Coffee shops were about $48 last week, above your usual $30.",
      },
      {
        type: "no_spend_day",
        difficulty: "medium",
        points: POINTS.medium,
        description: "Pick one day before Sunday with zero non-essential spending.",
        reason: "You've finished two easy challenges in a row, so here's a step up.",
      },
      {
        type: "subscription_review",
        difficulty: "hard",
        points: POINTS.hard,
        description: "Review your 4 streaming subscriptions and pause one you haven't used this month.",
        reason: "Subscriptions are your fastest-growing category over the last 3 months.",
      },
      {
        type: "cook_at_home",
        difficulty: "medium",
        points: POINTS.medium,
        description: "Cook dinner at home three nights this week.",
        reason: "Dining out was about $70 above your usual last week.",
      },
      {
        type: "transit_swap",
        difficulty: "easy",
        points: POINTS.easy,
        description: "Take transit instead of a rideshare once this week.",
        reason: "You took 3 short rideshare trips last week.",
      },
    ],
  },
];
