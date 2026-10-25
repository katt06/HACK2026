// The only place that talks to Claude. It sees the aggregated summary lines and nothing else.
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { LlmResponseSchema } from "./logic/challengeRules.js";

export const CHALLENGE_SYSTEM_PROMPT = `You are the coach in a savings app for young adults who are saving toward personal goals with friends.
You are a coach, not a financial advisor. You write small, concrete, encouraging weekly challenges.

Rules you must always follow:
- Never give investment, stock, crypto, retirement, tax, debt, loan, credit card, or insurance advice. Don't mention investing at all.
- Never suggest cutting or limiting spending on groceries, medicine or health care, rent, utilities, or insurance. Only target flexible spending: dining out, food delivery, coffee, shopping, entertainment, subscriptions, travel, personal care, and transport.
- Every challenge must be doable within 7 days and be clear enough that the user knows when it's done.
- Base each challenge on the spending summary. The reason must point to the relevant trend in plain words, using the numbers given. Don't invent numbers or merchants.
- Warm, upbeat, never shaming. Write to the user as "you".
- If you're told which challenges the user usually or rarely finishes, lean toward what they finish. Offer at most one stretch challenge from something they rarely finish, and make that one easy.

Challenge types (use only these):
- no_spend_day: a day with no non-essential purchases
- cook_at_home: cook instead of eating out or ordering delivery
- brew_at_home: make coffee at home instead of buying it
- category_cap: keep one flexible category under a limit this week
- subscription_review: review, pause, or cancel subscriptions
- transit_swap: walk, bike, or take transit instead of driving or ride-shares

difficulty is 1 (easy), 2 (medium), or 3 (hard); points are 30, 50, or 80 to match.
description: at most 120 characters. reason: at most 150 characters.`;

export interface GenerateOptions {
  apiKey: string;
  model: string;
  summaryLines: string[];
  historyLines?: string[]; // what the bandit has learned (describeWhatWorks): counts only
}

// Returns the raw challenge items. Callers validate each one; any thrown error means "use templates".
export function challengeUserMessage(summaryLines: string[], historyLines: string[] = []): string {
  const history = historyLines.length
    ? `\n\nWhat I've finished before:\n<history>\n${historyLines.map((l) => `- ${l}`).join("\n")}\n</history>`
    : "";
  return (
    `Here is my spending summary:\n<summary>\n${summaryLines.map((l) => `- ${l}`).join("\n") || "- (not enough data yet)"}\n</summary>${history}\n\n` +
    "Suggest 6 challenges for this week: at least 4 different types and all three difficulties. " +
    "Skip types I'm already working on if you can."
  );
}

export async function generateChallengesWithClaude({ apiKey, model, summaryLines, historyLines }: GenerateOptions): Promise<unknown[]> {
  // Short timeout and one retry: the app shows templates rather than making the user wait.
  const client = new Anthropic({ apiKey, timeout: 20_000, maxRetries: 1 });
  const response = await client.messages.parse({
    model,
    max_tokens: 16000,
    output_config: { effort: "low", format: zodOutputFormat(LlmResponseSchema) },
    system: CHALLENGE_SYSTEM_PROMPT,
    messages: [
      { role: "user", content: challengeUserMessage(summaryLines, historyLines) },
    ],
  });
  if (response.stop_reason !== "end_turn" || !response.parsed_output) {
    throw new Error(`Claude returned no usable challenges (stop_reason: ${response.stop_reason})`);
  }
  return response.parsed_output.challenges;
}
