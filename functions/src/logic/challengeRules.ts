// Validation and guardrails for generated challenges. Anything that fails is dropped, never repaired.
import { z } from "zod/v4"; // the SDK's zodOutputFormat helper takes zod/v4 schemas
import { CHALLENGE_POINTS, CHALLENGE_TYPES, type ChallengeType, type Difficulty, type TextSource } from "../contract.js";

// What we ask Claude to return. Deliberately loose: if one item is bad we drop that item,
// not the whole response, so tight limits live in ChallengeItemSchema below.
export const LlmResponseSchema = z.object({
  challenges: z.array(
    z.object({
      type: z.enum(CHALLENGE_TYPES),
      description: z.string(),
      difficulty: z.number(),
      points: z.number(),
      reason: z.string(),
    }),
  ),
});

export const ChallengeItemSchema = z.object({
  type: z.enum(CHALLENGE_TYPES),
  description: z.string().trim().min(10).max(160),
  difficulty: z.number().int().min(1).max(3),
  points: z.number().int().min(1).max(200),
  reason: z.string().trim().min(10).max(200),
});

export interface ChallengeCandidate {
  type: ChallengeType;
  difficulty: Difficulty;
  description: string;
  reason: string;
  points: number;
  source: TextSource;
}

const DIFFICULTY_BY_LEVEL: Record<number, Difficulty> = { 1: "easy", 2: "medium", 3: "hard" };

// Coach, not financial advisor: no investment or debt talk at all, and never cutting essentials.
const FINANCIAL_ADVICE =
  /\b(invest\w*|stocks?|crypto\w*|bitcoin|etfs?|index funds?|401\(?k\)?|ira|roth|debts?|loans?|credit cards?|mortgage\w*|refinanc\w*|interest rates?)\b/i;
const ESSENTIALS = /\b(grocer\w*|medicine|medication|prescriptions?|pharmacy|doctor|rent|utilit\w*|electric\w*|water bill|heating|insurance)\b/i;
const CUTTING = /\b(cut\w*|reduc\w*|skip\w*|limit\w*|cap|lower\w*|cancel\w*|less|fewer|trim\w*|stop\w*|avoid\w*|pause\w*|under \$|spend no)\b/i;

export function violatesGuardrails(text: string): boolean {
  return FINANCIAL_ADVICE.test(text) || (ESSENTIALS.test(text) && CUTTING.test(text));
}

// Validates each raw item on its own. Difficulty 1–3 maps to easy/medium/hard and points come from the
// fixed table, whatever the model said. Keeps the first candidate per (type, difficulty).
export function toCandidates(raw: unknown[]): ChallengeCandidate[] {
  const seen = new Set<string>();
  const candidates: ChallengeCandidate[] = [];
  for (const item of raw) {
    const parsed = ChallengeItemSchema.safeParse(item);
    if (!parsed.success) continue;
    const { type, description, reason } = parsed.data;
    if (violatesGuardrails(`${description} ${reason}`)) continue;
    const difficulty = DIFFICULTY_BY_LEVEL[parsed.data.difficulty];
    if (seen.has(`${type}_${difficulty}`)) continue;
    seen.add(`${type}_${difficulty}`);
    candidates.push({ type, difficulty, description, reason, points: CHALLENGE_POINTS[difficulty], source: "llm" });
  }
  return candidates;
}

// LLM candidates alone if they offer enough distinct options, otherwise topped up with templates.
export function mergeCandidates(llm: ChallengeCandidate[], templates: ChallengeCandidate[], needed: number): ChallengeCandidate[] {
  return llm.length >= needed ? llm : [...llm, ...templates];
}
