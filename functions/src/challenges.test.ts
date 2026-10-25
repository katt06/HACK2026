// A6: what the LLM sees, what we accept back from it, and the fallbacks.
import { describe, expect, it } from "vitest";
import { generateSeedUser } from "../../scripts/seedData.js";
import { CHALLENGE_POINTS, CHALLENGE_TYPES } from "./contract.js";
import { mergeCandidates, toCandidates, violatesGuardrails } from "./logic/challengeRules.js";
import { takeRateLimitSlot } from "./logic/rateLimit.js";
import { normalizeMerchant } from "./logic/recurring.js";
import { buildSpendingSummary, summaryToText, topRisingTrend } from "./logic/spendingSummary.js";
import { CHALLENGE_SYSTEM_PROMPT, challengeUserMessage } from "./llm.js";
import { describeWhatWorks } from "./logic/learnedPreferences.js";
import type { BanditStatsDoc } from "./contract.js";
import { templateCandidates } from "./templates.js";

const TODAY = "2026-10-24";
const GENERIC_WORDS = new Set(["coffee", "transfer", "savings", "store", "payroll", "payout", "apartments", "kitchen", "bread", "power", "light", "wireless", "internet", "insurance"]);
const summaryOf = (uid: Parameters<typeof generateSeedUser>[0], activeChallengeTypes: (typeof CHALLENGE_TYPES)[number][] = []) => {
  const u = generateSeedUser(uid, TODAY);
  return {
    user: u,
    summary: buildSpendingSummary({
      today: TODAY,
      transactions: u.transactions,
      baselineSpendByCategory: u.baselineSpendByCategory,
      goalProgressPct: 42,
      activeChallengeTypes,
    }),
  };
};

describe("spending summary (the LLM's only input)", () => {
  it("never contains a merchant name or an essential category", () => {
    for (const uid of ["delivery-spender", "subscription-creep", "demo-hero"] as const) {
      const { user, summary } = summaryOf(uid);
      const text = summaryToText(summary).join("\n").toLowerCase();
      for (const t of user.transactions) {
        // Brand words only: "coffee" or "savings" are also category/summary vocabulary.
        for (const word of normalizeMerchant(t.merchant).split(" ").filter((w) => w.length >= 4 && !GENERIC_WORDS.has(w))) {
          expect(text, `leaked "${word}" from ${t.merchant}`).not.toContain(word);
        }
      }
      expect(text).not.toMatch(/groceries|rent|utilities|insurance|medical|income|transfer/);
    }
  });

  it("describes trends in plain words", () => {
    const { summary } = summaryOf("delivery-spender", ["brew_at_home"]);
    const lines = summaryToText(summary);
    expect(lines.find((l) => l.startsWith("food delivery:"))).toMatch(/^food delivery: \$\d[\d,]* in the last 30 days, up \d+% vs\. a typical month$/);
    expect(lines).toContain("savings goal progress: 42%");
    expect(lines).toContain("already working on: brew_at_home");
    expect(topRisingTrend(summary)?.category).toBe("delivery");
  });

  it("counts subscriptions without naming them", () => {
    const { summary } = summaryOf("subscription-creep");
    expect(summary.subscriptionCount).toBe(8);
    expect(summaryToText(summary)).toContain("subscriptions: 8 recurring charges");
  });
});

describe("validating Claude's output", () => {
  const good = { type: "brew_at_home", description: "Make coffee at home four mornings this week.", difficulty: 2, points: 50, reason: "Coffee is up 30% vs. a typical month." };

  it("maps difficulty 1–3 and fixes points by difficulty, whatever the model said", () => {
    expect(toCandidates([{ ...good, points: 70 }, { ...good, type: "no_spend_day", difficulty: 3, points: 5 }])).toEqual([
      { type: "brew_at_home", difficulty: "medium", description: good.description, reason: good.reason, points: CHALLENGE_POINTS.medium, source: "llm" },
      { type: "no_spend_day", difficulty: "hard", description: good.description, reason: good.reason, points: CHALLENGE_POINTS.hard, source: "llm" },
    ]);
  });

  it("drops invalid items and keeps the rest", () => {
    const raw = [
      good,
      { ...good, type: "buy_bitcoin" },
      { ...good, points: 999 },
      { ...good, difficulty: 4 },
      { ...good, difficulty: 1.5 },
      { ...good, description: "Too short" },
      { ...good, reason: "x".repeat(201) },
      { type: "cook_at_home" },
      "not an object",
      null,
    ];
    expect(toCandidates(raw)).toHaveLength(1);
  });

  it("keeps one candidate per type and difficulty", () => {
    expect(toCandidates([good, { ...good, description: "Brew at home on four weekday mornings." }])).toHaveLength(1);
  });

  it.each([
    "Put the savings into an index fund.",
    "Pay down your credit card with the extra cash.",
    "Spend less on groceries this week.",
    "Skip one prescription refill.",
    "Cut back on utilities by unplugging things.",
    "Lower your rent by talking to your landlord.",
  ])("blocks advice or cuts to essentials: %s", (text) => {
    expect(violatesGuardrails(text)).toBe(true);
    expect(toCandidates([{ ...good, description: text }])).toEqual([]);
  });

  it.each(["Cook at home with groceries you already have.", "Have two no-spend days this week.", "Pause one subscription you haven't used."])(
    "allows: %s",
    (text) => expect(violatesGuardrails(text)).toBe(false),
  );
});

describe("templates", () => {
  it("cover every type and difficulty, with fixed points, and pass the guardrails", () => {
    const templates = templateCandidates();
    expect(templates).toHaveLength(CHALLENGE_TYPES.length * 3);
    for (const t of templates) {
      expect(violatesGuardrails(`${t.description} ${t.reason}`), t.description).toBe(false);
      expect(t.points).toBe(CHALLENGE_POINTS[t.difficulty]);
      expect(t.source).toBe("template");
    }
  });

  it("personalize reasons and the category cap from the summary", () => {
    const templates = templateCandidates(summaryOf("delivery-spender").summary);
    const cap = templates.find((t) => t.type === "category_cap" && t.difficulty === "easy")!;
    expect(cap.description).toBe("Keep food delivery about 10% below your usual week.");
    expect(cap.reason).toMatch(/^Food delivery was \$\d[\d,]* in the last 30 days, up \d+% vs\. a typical month\.$/);
    const transit = templates.find((t) => t.type === "transit_swap")!;
    expect(transit.reason).toMatch(/down \d+% vs\. a typical month\. Nice work, this keeps it going\.$/);
    const subs = templateCandidates(summaryOf("subscription-creep").summary).find((t) => t.type === "subscription_review")!;
    expect(subs.reason).toBe("You have 8 recurring subscriptions, and they're easy to forget about.");
  });

  it("are used to top up when Claude returns too few", () => {
    const llm = toCandidates([{ type: "brew_at_home", description: "Make coffee at home four mornings this week.", difficulty: 2, points: 50, reason: "Coffee is up 30% lately." }]);
    expect(mergeCandidates(llm, templateCandidates(), 3)).toHaveLength(1 + 18);
    expect(mergeCandidates([...llm, ...llm, ...llm], templateCandidates(), 3)).toHaveLength(3);
  });
});

describe("rate limit", () => {
  const now = new Date("2026-10-24T12:00:00.000Z");
  const minutesAgo = (m: number) => new Date(now.getTime() - m * 60_000).toISOString();

  it("allows 10 calls per rolling hour", () => {
    const nine = Array.from({ length: 9 }, (_, i) => minutesAgo(i + 1));
    const tenth = takeRateLimitSlot(nine, now);
    expect(tenth.allowed).toBe(true);
    expect(tenth.calls).toHaveLength(10);
    expect(takeRateLimitSlot(tenth.calls, now).allowed).toBe(false);
  });

  it("forgets calls older than an hour", () => {
    const old = Array.from({ length: 10 }, () => minutesAgo(61));
    expect(takeRateLimitSlot(old, now)).toEqual({ allowed: true, calls: [now.toISOString()] });
  });
});

describe("system prompt", () => {
  it("states the CLAUDE.md guardrails", () => {
    expect(CHALLENGE_SYSTEM_PROMPT).toMatch(/coach, not a financial advisor/);
    expect(CHALLENGE_SYSTEM_PROMPT).toMatch(/Never give investment/);
    expect(CHALLENGE_SYSTEM_PROMPT).toMatch(/groceries, medicine or health care, rent, utilities, or insurance/);
    for (const type of CHALLENGE_TYPES) expect(CHALLENGE_SYSTEM_PROMPT).toContain(type);
  });
});

describe("what the bandit has learned, for the prompt", () => {
  const stat = (challengeType: BanditStatsDoc["challengeType"], difficulty: BanditStatsDoc["difficulty"], attempts: number, completions: number): BanditStatsDoc => ({
    userId: "u",
    challengeType,
    difficulty,
    attempts,
    completions,
  });

  it("names clear patterns by type and difficulty, strongest first, with counts", () => {
    const lines = describeWhatWorks([
      stat("cook_at_home", "easy", 3, 3),
      stat("cook_at_home", "medium", 2, 1),
      stat("subscription_review", "hard", 3, 0),
      stat("brew_at_home", "easy", 2, 2),
    ]);
    expect(lines).toEqual([
      "usually finishes cook-at-home challenges (4 of 5)",
      "usually finishes easy challenges (5 of 5)",
      "rarely finishes hard challenges (0 of 3)",
      "rarely finishes subscription review challenges (0 of 3)",
    ]);
  });

  it("says nothing until there's enough evidence, and skips middling rates", () => {
    expect(describeWhatWorks([stat("cook_at_home", "easy", 1, 1)])).toEqual([]);
    expect(describeWhatWorks([stat("transit_swap", "medium", 4, 2)])).toEqual([]);
  });

  it("goes into the prompt only when there is something to say, and never with dollars", () => {
    const withHistory = challengeUserMessage(["coffee: $48 in the last 30 days"], ["usually finishes easy challenges (5 of 6)"]);
    expect(withHistory).toContain("<history>\n- usually finishes easy challenges (5 of 6)\n</history>");
    expect(challengeUserMessage(["coffee: $48"])).not.toContain("<history>");
    expect(describeWhatWorks([stat("cook_at_home", "easy", 5, 5)]).join(" ")).not.toMatch(/\$/);
  });
});
