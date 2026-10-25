import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { onCall } from "firebase-functions/v2/https";
import { defineSecret, defineString } from "firebase-functions/params";
import type {
  BanditStatsDoc,
  ChallengeDoc,
  GetChallengesRequest,
  GetChallengesResponse,
  GoalDoc,
  RateLimitDoc,
  TransactionDoc,
  UserDoc,
  WithId,
} from "./contract.js";
import { expireStaleChallenges, loadBanditStats } from "./banditStore.js";
import { OPEN_STATUSES, pickChallenges } from "./logic/bandit.js";
import { mergeCandidates, toCandidates, type ChallengeCandidate } from "./logic/challengeRules.js";
import { addDays, todayIso } from "./logic/dates.js";
import { describeWhatWorks } from "./logic/learnedPreferences.js";
import { takeRateLimitSlot } from "./logic/rateLimit.js";
import { goalProgressPct } from "./logic/scoring.js";
import { buildSpendingSummary, summaryToText, type SpendingSummary } from "./logic/spendingSummary.js";
import { generateChallengesWithClaude } from "./llm.js";
import { templateCandidates } from "./templates.js";
import { requireAuth } from "./validate.js";

// API key lives only in Functions (CLAUDE.md). In the emulator, put it in functions/.secret.local.
const anthropicApiKey = defineSecret("ANTHROPIC_API_KEY");
const claudeModel = defineString("CLAUDE_MODEL", { default: "claude-opus-5-5" });

export const ACTIVE_CHALLENGES = 3;
const SUMMARY_HISTORY_DAYS = 120;

const armKey = (c: { type: string; difficulty: string }) => `${c.type}_${c.difficulty}`;
// Oldest first; challenges created together share a timestamp, so the id breaks ties for a stable order.
const byCreated = (a: WithId<ChallengeDoc>, b: WithId<ChallengeDoc>) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);

async function loadActive(db: Firestore, uid: string): Promise<WithId<ChallengeDoc>[]> {
  const snap = await db.collection("challenges").where("userId", "==", uid).where("status", "in", [...OPEN_STATUSES]).get();
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as ChallengeDoc) })).sort(byCreated);
}

async function loadSummary(db: Firestore, uid: string, active: ChallengeDoc[]): Promise<SpendingSummary> {
  const user = (await db.doc(`users/${uid}`).get()).data() as UserDoc | undefined;
  const today = todayIso(new Date(), user?.settings?.timezone);
  const [txSnap, goalsSnap] = await Promise.all([
    db.collection("transactions").where("userId", "==", uid).where("date", ">=", addDays(today, -SUMMARY_HISTORY_DAYS)).get(),
    db.collection("goals").where("ownerId", "==", uid).get(),
  ]);
  const goals = goalsSnap.docs.map((d) => ({ goal: d.data() as GoalDoc, entries: [] }));
  return buildSpendingSummary({
    today,
    transactions: txSnap.docs.map((d) => d.data() as TransactionDoc),
    baselineSpendByCategory: user?.baselineSpendByCategory ?? {},
    goalProgressPct: goals.length > 0 ? goalProgressPct(goals) : null,
    activeChallengeTypes: active.map((c) => c.type),
  });
}

// 10 LLM calls per user per hour, counted in Firestore so it holds across function instances.
async function takeLlmSlot(db: Firestore, uid: string): Promise<boolean> {
  const ref = db.doc(`rateLimits/${uid}`);
  return db.runTransaction(async (tx) => {
    const doc = (await tx.get(ref)).data() as RateLimitDoc | undefined;
    const { allowed, calls } = takeRateLimitSlot(doc?.llmCalls ?? [], new Date());
    tx.set(ref, { llmCalls: calls } satisfies RateLimitDoc);
    return allowed;
  });
}

// Claude's suggestions when possible; templates on rate limit, missing key, or any error. Never throws.
async function generateCandidates(
  db: Firestore,
  uid: string,
  active: ChallengeDoc[],
  stats: BanditStatsDoc[],
  needed: number,
): Promise<ChallengeCandidate[]> {
  let summary: SpendingSummary | undefined;
  try {
    summary = await loadSummary(db, uid, active);
    const templates = templateCandidates(summary);
    const apiKey = anthropicApiKey.value();
    if (!apiKey) return templates;
    if (!(await takeLlmSlot(db, uid))) {
      logger.info("LLM rate limit reached; using templates", { uid });
      return templates;
    }
    // Closing the loop: Claude writes toward what the bandit has seen this user finish.
    const raw = await generateChallengesWithClaude({
      apiKey,
      model: claudeModel.value(),
      summaryLines: summaryToText(summary),
      historyLines: describeWhatWorks(stats),
    });
    const llm = toCandidates(raw);
    logger.info("Generated challenges", { uid, returned: raw.length, valid: llm.length });
    return mergeCandidates(llm, templates, needed);
  } catch (err) {
    logger.warn("Challenge generation failed; using templates", { uid, error: String(err) });
    return templateCandidates(summary);
  }
}

// Returns the caller's open (offered or accepted) challenges, topping up to 3 with new ones when needed.
export const getChallenges = onCall<GetChallengesRequest>(
  { secrets: [anthropicApiKey] },
  async (request): Promise<GetChallengesResponse> => {
    const uid = requireAuth(request);
    const db = getFirestore();
    await expireStaleChallenges(db, uid); // ignored for a week = failure for the bandit, and frees the slot
    const active = await loadActive(db, uid);
    const needed = ACTIVE_CHALLENGES - active.length;
    if (needed <= 0) return { challenges: active };

    const taken = new Set(active.map(armKey));
    const stats = await loadBanditStats(db, uid);
    const generated = await generateCandidates(db, uid, active, stats, needed);
    const picks = pickChallenges(
      generated.filter((c) => !taken.has(armKey(c))),
      stats,
      needed,
    );

    const now = new Date().toISOString();
    const batch = db.batch();
    const created = picks.map((c): WithId<ChallengeDoc> => {
      const ref = db.collection("challenges").doc();
      const doc: ChallengeDoc = {
        userId: uid,
        type: c.type,
        description: c.description,
        points: c.points,
        difficulty: c.difficulty,
        status: "active",
        createdAt: now,
        completedAt: null,
        reason: c.reason,
        source: c.source,
      };
      batch.set(ref, doc);
      return { id: ref.id, ...doc };
    });
    await batch.commit();
    return { challenges: [...active, ...created].sort(byCreated) };
  },
);
