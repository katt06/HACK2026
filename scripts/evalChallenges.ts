// Offline evaluation of A6: Claude-written challenges vs. the template fallback, on the 5 seeded personas.
// Usage: npm run eval:challenges [-- --runs 3] [-- --judge]   → scripts/out/challengeEval.json
//
// Both sources get exactly what production gives them: the aggregated spending summary (and, for Claude,
// what the bandit has learned from the persona's past challenges). Metrics, per challenge unless noted:
//   guardrailPass    passes the item schema and the safety filters (no investing/debt talk, no cutting essentials)
//   groundedReason   the "why" cites a $ or % figure that really is in the summary
//   madeUpNumber     the "why" cites a $ or % figure that is NOT in the summary (lower is better)
//   personalized     mentions one of the persona's own spending categories
//   followsBrief     per response: at least 4 types and all 3 difficulties, as the prompt asks (Claude only;
//                    templates cover every arm by construction)
//   crossUserOverlap mean text similarity between different personas' challenges (lower = more tailored)
//   judge            optional blind Claude-as-judge scores (1–5) for specific, doable, and coach voice
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod/v4";
import type { BanditStatsDoc, ChallengeType, Difficulty } from "../functions/src/contract.js";
import { banditStatsId, updateStats } from "../functions/src/logic/bandit.js";
import { ChallengeItemSchema, toCandidates, violatesGuardrails, type ChallengeCandidate } from "../functions/src/logic/challengeRules.js";
import { describeWhatWorks } from "../functions/src/logic/learnedPreferences.js";
import { buildSpendingSummary, categoryLabel, summaryToText, type SpendingSummary } from "../functions/src/logic/spendingSummary.js";
import { CHALLENGE_SYSTEM_PROMPT, generateChallengesWithClaude } from "../functions/src/llm.js";
import { templateCandidates } from "../functions/src/templates.js";
import { PERSONA_IDS, generateSeedData, type PersonaId } from "./seedData.js";

const TODAY = "2026-10-24"; // fixed so runs are comparable
const OUTPUT = "scripts/out/challengeEval.json";
const args = process.argv.slice(2);
const RUNS = Number(args[args.indexOf("--runs") + 1]) || 1;
const JUDGE = args.includes("--judge");

// ---------- inputs: exactly what production builds ----------

interface PersonaInput {
  id: PersonaId;
  summary: SpendingSummary;
  summaryLines: string[];
  historyLines: string[];
}

// generateSeedData (not generateSeedUser) so each persona has the same challenge history the seed script writes.
const SEED_USERS = generateSeedData(TODAY).users;

function personaInput(id: PersonaId): PersonaInput {
  const user = SEED_USERS.find((u) => u.uid === id)!;
  const summary = buildSpendingSummary({
    today: TODAY,
    transactions: user.transactions,
    baselineSpendByCategory: user.baselineSpendByCategory,
    goalProgressPct: user.score.goalProgressPct,
    activeChallengeTypes: [],
  });
  // Same aggregation the seed script writes to banditStats.
  const stats = new Map<string, BanditStatsDoc>();
  for (const c of user.completedChallenges) {
    const key = banditStatsId(id, c);
    const prev = stats.get(key);
    stats.set(key, { userId: id, challengeType: c.type, difficulty: c.difficulty, ...updateStats(prev, c.status === "completed") });
  }
  return { id, summary, summaryLines: summaryToText(summary), historyLines: describeWhatWorks([...stats.values()]) };
}

// ---------- metrics ----------

type Item = { type: ChallengeType; difficulty: Difficulty; description: string; reason: string };

const figures = (text: string) =>
  [...text.matchAll(/\$\s?([\d,]+(?:\.\d+)?)|(\d+(?:\.\d+)?)\s?%/g)].map((m) => (m[1] ? `$${m[1].replace(/,/g, "")}` : `${m[2]}%`));

function itemMetrics(item: Item, input: PersonaInput) {
  const known = new Set(input.summaryLines.flatMap(figures));
  const cited = figures(item.reason);
  const labels = input.summary.trends.map((t) => categoryLabel(t.category).toLowerCase());
  const text = `${item.description} ${item.reason}`.toLowerCase();
  return {
    groundedReason: cited.some((f) => known.has(f)),
    madeUpNumber: cited.some((f) => !known.has(f)),
    personalized: labels.some((l) => text.includes(l)),
  };
}

const words = (s: string) => new Set(s.toLowerCase().match(/[a-z]+/g) ?? []);
function jaccard(a: Set<string>, b: Set<string>): number {
  const inter = [...a].filter((w) => b.has(w)).length;
  return inter / (a.size + b.size - inter || 1);
}

// Mean similarity between the challenge texts of different personas (1 = identical wording).
function crossUserOverlap(byPersona: Map<PersonaId, Item[]>): number {
  const sets = [...byPersona.values()].map((items) => words(items.map((i) => `${i.description} ${i.reason}`).join(" ")));
  const pairs: number[] = [];
  for (let i = 0; i < sets.length; i++) for (let j = i + 1; j < sets.length; j++) pairs.push(jaccard(sets[i], sets[j]));
  return round(pairs.reduce((s, x) => s + x, 0) / (pairs.length || 1));
}

const mean = (xs: boolean[] | number[]) => round((xs as number[]).reduce((s: number, x) => s + Number(x), 0) / (xs.length || 1));
function round(x: number): number {
  return Math.round(x * 1000) / 1000;
}

// ---------- Claude ----------

function loadKey(): string | null {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
  const file = "functions/.secret.local";
  if (!existsSync(file)) return null;
  return readFileSync(file, "utf8").match(/^ANTHROPIC_API_KEY=(.+)$/m)?.[1].trim() ?? null;
}

function loadModel(): string {
  return readFileSync("functions/.env", "utf8").match(/^CLAUDE_MODEL=(.+)$/m)?.[1].trim() ?? "claude-opus-5-5";
}

const JudgeSchema = z.object({
  scores: z.array(z.object({ id: z.number(), specific: z.number(), doable: z.number(), voice: z.number() })),
});

// Blind: items from both sources are shuffled together and labeled only by number.
async function judge(client: Anthropic, model: string, input: PersonaInput, items: Item[]) {
  const order = items.map((item, id) => ({ id, item })).sort(() => Math.random() - 0.5);
  const response = await client.messages.parse({
    model,
    max_tokens: 4000,
    output_config: { effort: "low", format: zodOutputFormat(JudgeSchema) },
    system:
      "You review weekly savings challenges written for one user. Score each from 1 (poor) to 5 (excellent) on: " +
      "specific (fits this user's own spending, not generic), doable (clear and realistic within 7 days), and voice " +
      "(warm, encouraging coach; no shaming; no financial advice). Judge each challenge on its own merits.",
    messages: [
      {
        role: "user",
        content:
          `User's spending summary:\n${input.summaryLines.map((l) => `- ${l}`).join("\n")}\n\nChallenges:\n` +
          order.map(({ id, item }) => `${id}. ${item.description} (why: ${item.reason})`).join("\n"),
      },
    ],
  });
  return response.parsed_output?.scores ?? [];
}

// ---------- run ----------

async function main() {
  const inputs = PERSONA_IDS.map(personaInput);
  const key = loadKey();
  const model = loadModel();
  let claudeSkipped: string | null = key ? null : "No ANTHROPIC_API_KEY (env or functions/.secret.local).";
  const client = key ? new Anthropic({ apiKey: key, timeout: 60_000, maxRetries: 1 }) : null;

  const template = new Map<PersonaId, Item[]>();
  const claude = new Map<PersonaId, Item[]>();
  const claudeRaw: { persona: PersonaId; returned: number; passed: number; followsBrief: boolean }[] = [];
  const judgeScores: Record<"llm" | "template", { specific: number; doable: number; voice: number }[]> = { llm: [], template: [] };

  for (const input of inputs) {
    template.set(input.id, templateCandidates(input.summary));
    if (!client || claudeSkipped) continue;
    for (let run = 0; run < RUNS; run++) {
      try {
        const raw = await generateChallengesWithClaude({ apiKey: key!, model, summaryLines: input.summaryLines, historyLines: input.historyLines });
        const kept: ChallengeCandidate[] = toCandidates(raw);
        const types = new Set(kept.map((c) => c.type));
        const levels = new Set(kept.map((c) => c.difficulty));
        claudeRaw.push({ persona: input.id, returned: raw.length, passed: kept.length, followsBrief: types.size >= 4 && levels.size === 3 });
        claude.set(input.id, [...(claude.get(input.id) ?? []), ...kept]);
        console.log(`${input.id} run ${run + 1}: ${kept.length}/${raw.length} passed`);
      } catch (err) {
        claudeSkipped = `Claude call failed: ${String(err).slice(0, 160)}`;
        console.warn(claudeSkipped);
        break;
      }
    }
    if (JUDGE && client && !claudeSkipped && claude.get(input.id)?.length) {
      const llmItems = claude.get(input.id)!;
      const tplItems = template.get(input.id)!.filter((_, i) => i % 3 === 0).slice(0, llmItems.length); // a same-size template sample
      const scores = await judge(client, model, input, [...llmItems, ...tplItems]);
      for (const s of scores) (s.id < llmItems.length ? judgeScores.llm : judgeScores.template).push(s);
    }
  }

  const summarize = (byPersona: Map<PersonaId, Item[]>, source: "llm" | "template") => {
    const rows = inputs.flatMap((input) => (byPersona.get(input.id) ?? []).map((item) => itemMetrics(item, input)));
    if (rows.length === 0) return null;
    const scores = judgeScores[source];
    return {
      challenges: rows.length,
      groundedReason: mean(rows.map((r) => r.groundedReason)),
      madeUpNumber: mean(rows.map((r) => r.madeUpNumber)),
      personalized: mean(rows.map((r) => r.personalized)),
      crossUserOverlap: crossUserOverlap(byPersona),
      typesPerPersona: mean(inputs.map((i) => new Set((byPersona.get(i.id) ?? []).map((c) => c.type)).size)),
      judge: scores.length
        ? { specific: mean(scores.map((s) => s.specific)), doable: mean(scores.map((s) => s.doable)), voice: mean(scores.map((s) => s.voice)), n: scores.length }
        : null,
    };
  };

  // Templates are validated the same way Claude's output is, so the guardrail rate is comparable.
  const templateGuardrail = mean(
    [...template.values()].flat().map((t) => ChallengeItemSchema.safeParse({ ...t, difficulty: 1 }).success && !violatesGuardrails(`${t.description} ${t.reason}`)),
  );
  const returned = claudeRaw.reduce((s, r) => s + r.returned, 0);

  const result = {
    config: { today: TODAY, personas: PERSONA_IDS, runsPerPersona: RUNS, model, judge: JUDGE, promptChars: CHALLENGE_SYSTEM_PROMPT.length },
    claudeSkipped,
    inputs: inputs.map((i) => ({ persona: i.id, summaryLines: i.summaryLines, historyLines: i.historyLines })),
    template: { ...summarize(template, "template"), guardrailPass: templateGuardrail },
    claude: claudeSkipped && claude.size === 0
      ? null
      : {
          ...summarize(claude, "llm"),
          guardrailPass: returned ? round(claudeRaw.reduce((s, r) => s + r.passed, 0) / returned) : null,
          followsBrief: mean(claudeRaw.map((r) => r.followsBrief)),
          responses: claudeRaw,
        },
    examples: inputs.map((i) => ({
      persona: i.id,
      template: template.get(i.id)!.slice(0, 2).map(({ description, reason }) => ({ description, reason })),
      claude: (claude.get(i.id) ?? []).slice(0, 2).map(({ description, reason }) => ({ description, reason })),
    })),
  };

  mkdirSync("scripts/out", { recursive: true });
  writeFileSync(OUTPUT, JSON.stringify(result, null, 2) + "\n");
  console.log(`→ ${OUTPUT}`);
  console.table({ template: result.template, ...(result.claude ? { claude: { ...result.claude, responses: undefined } } : {}) });
  if (claudeSkipped) console.warn(`Claude side skipped: ${claudeSkipped}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
