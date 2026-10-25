// Shared contract between /web and /functions (imported by /web via the `@contract` alias).
// Types, constants, and small pure helpers only. This file must not import anything,
// so it stays safe to bundle into both the browser and Cloud Functions.
//
// Conventions:
// - Money is always integer cents (`Cents`). Format for display on the client.
// - Dates are ISO 8601 strings: `IsoDate` = "2026-10-24", `IsoDateTime` = "2026-10-24T17:00:00.000Z".
//   This keeps the same types valid for both the Admin SDK and the web SDK.
// - Firestore document types do not include their id; use `WithId<T>` when you need it.

export type Cents = number;
export type IsoDate = string;
export type IsoDateTime = string;
export type WithId<T> = T & { id: string };

// ---------- Enums ----------

export const CATEGORIES = [
  "groceries",
  "dining",
  "delivery",
  "coffee",
  "shopping",
  "entertainment",
  "subscriptions",
  "transport",
  "travel",
  "personal_care",
  "rent",
  "utilities",
  "insurance",
  "medical",
  "income",
  "transfer", // money moved to the user's own savings; never counted as spending
  "other",
] as const;
export type Category = (typeof CATEGORIES)[number];

// Never suggest cutting these (product voice rule).
export const ESSENTIAL_CATEGORIES = [
  "groceries",
  "medical",
  "rent",
  "utilities",
  "insurance",
] as const satisfies readonly Category[];

export type Cadence = "weekly" | "biweekly" | "monthly" | "yearly";

export const CHALLENGE_TYPES = [
  "no_spend_day",
  "cook_at_home",
  "brew_at_home",
  "category_cap",
  "subscription_review",
  "transit_swap",
] as const;
export type ChallengeType = (typeof CHALLENGE_TYPES)[number];

export type Difficulty = "easy" | "medium" | "hard";

// Points are fixed by difficulty (never chosen by the LLM), so generated challenges can't inflate the leaderboard.
export const CHALLENGE_POINTS = { easy: 30, medium: 50, hard: 80 } as const satisfies Record<Difficulty, number>;

// active = offered; accepted = the user said "I'm in" (counts as a bandit attempt); then completed.
// Offers left for a week expire: ignored ones count as a failed attempt too.
export type ChallengeStatus = "active" | "accepted" | "completed" | "skipped" | "expired";

// Where generated copy came from. "template" is the rate-limit / failure fallback.
export type TextSource = "llm" | "template";

// ---------- Firestore documents ----------

// users/{uid}
export interface UserSettings {
  notificationsEnabled: boolean;
  timezone: string; // IANA, e.g. "America/New_York"
}

export interface UserDoc {
  displayName: string;
  baselineSpendByCategory: Partial<Record<Category, Cents>>; // typical monthly spend
  settings: UserSettings;
  // Spendable shop currency (server-written; private to the user). Coins are earned 1:1 with XP but can go
  // down when spent. Until the server tracks it, clients treat a missing value as "all XP, nothing spent".
  coins?: number;
  // Shop items bought (server-written; private). Starter items are always owned and aren't listed here.
  inventory?: ItemId[];
}

// goals/{id}
export interface SizingRecommendation {
  weeklyContribution: Cents;
  suggestedTargetAmount: Cents; // may equal the goal's targetAmount
  suggestedDeadline: IsoDate;
  rationale: string;
}

export interface GoalDoc {
  ownerId: string;
  name: string;
  targetAmount: Cents;
  currentAmount: Cents;
  deadline: IsoDate;
  verified: boolean; // currentAmount confirmed against linked account data (server-only)
  sizingRecommendation: SizingRecommendation | null; // server-only
  pausedUntil: IsoDate | null; // set by goal flex "pause"; no saving expected before this date
  createdAt: IsoDateTime;
}

export const GOAL_NAME_MAX = 60;

// goals/{goalId}/entries/{id}: the goal's activity log.
// Contributions logged by the user are always unverified; only the server can mark one verified.
export interface ContributionEntry {
  kind: "contribution";
  amount: Cents;
  verified: boolean;
  note: string;
  createdAt: IsoDateTime;
}

// Goal flex: an unexpected expense squeezed the budget (the goal balance is untouched).
// "pause" = skip saving for a few weeks, same pace after; "lowerPace" = save less per week, finish later.
export type FlexChoice = "pause" | "lowerPace";

export interface ExpenseEntry {
  kind: "expense";
  amount: Cents;
  choice: FlexChoice;
  weeksLater: number; // how far the deadline moved
  note: string;
  createdAt: IsoDateTime;
}

export type GoalEntryDoc = ContributionEntry | ExpenseEntry;

// transactions/{id} (server-only)
export interface TransactionDoc {
  userId: string;
  amount: Cents; // positive = money out
  category: Category;
  merchant: string;
  date: IsoDate;
  recurringId: string | null;
}

// accounts/{uid} (server-only): the checking balance the forecast starts from.
export interface AccountDoc {
  userId: string;
  currentBalance: Cents;
  asOf: IsoDate;
}

// recurring/{id} (server-only)
export interface RecurringDoc {
  userId: string;
  merchant: string;
  amount: Cents; // typical amount, always positive; isPayday says which direction
  cadence: Cadence;
  nextDue: IsoDate;
  category: Category;
  isPayday: boolean; // recurring inflow
}

// challenges/{id}
export interface ChallengeDoc {
  userId: string;
  type: ChallengeType;
  description: string;
  points: number;
  difficulty: Difficulty;
  status: ChallengeStatus;
  createdAt: IsoDateTime;
  completedAt: IsoDateTime | null;
  reason: string; // why this challenge was picked for the user
  source?: TextSource; // who wrote the text: Claude ("llm") or a fallback template; older docs don't have it
}

// banditStats/{uid_type_difficulty}
export type BanditStatsId = `${string}_${ChallengeType}_${Difficulty}`;

export interface BanditStatsDoc {
  userId: string;
  challengeType: ChallengeType;
  difficulty: Difficulty;
  attempts: number;
  completions: number;
}

// groups/{id}
// Invite codes skip look-alike characters (0/O, 1/I) so they're easy to read aloud.
export const INVITE_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const INVITE_CODE_LENGTH = 6;
export const MAX_GROUP_MEMBERS = 20;

export interface GroupDoc {
  name: string; // 1–40 chars
  members: string[]; // uids
  memberNames: Record<string, string>; // uid → display name, so members never need to read users/{uid}
  inviteCode: string;
}

export interface GroupMember {
  userId: string;
  displayName: string;
  isMe: boolean;
}

export interface GroupSummary {
  id: string;
  name: string;
  inviteCode: string;
  members: GroupMember[];
}

// "sav-e 24" → "SAVE24". Returns null unless the result is a well-formed code.
export function normalizeInviteCode(raw: string): string | null {
  const code = raw.toUpperCase().replace(/[\s-]/g, "");
  const valid = code.length === INVITE_CODE_LENGTH && [...code].every((c) => INVITE_CODE_ALPHABET.includes(c));
  return valid ? code : null;
}

export function toGroupSummary(id: string, group: GroupDoc, viewerUid: string): GroupSummary {
  return {
    id,
    name: group.name,
    inviteCode: group.inviteCode,
    members: group.members.map((userId) => ({
      userId,
      displayName: group.memberNames[userId] ?? "Member",
      isMe: userId === viewerUid,
    })),
  };
}

// scores/{uid}. Readable by group members, so never put dollar amounts here.
export interface ScoreDoc {
  userId: string;
  goalProgressPct: number; // 0–100
  // Consecutive weeks (Mon–Sun) where goal contributions met that week's target: the sum over active goals
  // of (target - saved) / weeks to deadline, frozen at week start. Weeks with no active goals, or a missed
  // week where safe-to-save was $0 on more than 4 days, pause the streak instead of breaking it.
  streak: number;
  improvementScore: number; // 0–100: % drop in discretionary spend (last 30 days) vs. baseline
  points: number; // XP: never decreases; drives level and leaderboard rank
  level: number; // starts at 1
  badges?: BadgeId[]; // earned badges (server-written; badges stay earned even if a streak later breaks)
  avatar?: EquippedAvatar; // what the capybara is wearing, shown to the group (server-written); missing = DEFAULT_AVATAR
}

// ---------- Game layer: levels and badges ----------

export const XP_PER_LEVEL = 100; // same as POINTS_PER_LEVEL in logic/scoring.ts

export function levelProgress(xp: number): { level: number; xpIntoLevel: number; xpPerLevel: number } {
  const safe = Math.max(0, Math.floor(xp));
  return { level: Math.floor(safe / XP_PER_LEVEL) + 1, xpIntoLevel: safe % XP_PER_LEVEL, xpPerLevel: XP_PER_LEVEL };
}

export type BadgeId = "first-float" | "chill-streak" | "yuzu-master";

export const BADGES: Record<BadgeId, { name: string; hint: string; goal: number; unit: string }> = {
  "first-float": { name: "First Float", hint: "Create your first goal", goal: 1, unit: "goal" },
  "chill-streak": { name: "Chill Streak", hint: "Keep a 4-week saving streak", goal: 4, unit: "weeks" },
  "yuzu-master": { name: "Yuzu Master", hint: "Complete 10 challenges", goal: 10, unit: "challenges" },
};

export const BADGE_ORDER: BadgeId[] = ["first-float", "chill-streak", "yuzu-master"];

export interface BadgeStats {
  goalsCreated: number;
  streak: number; // weeks
  challengesCompleted: number;
}

export interface BadgeProgress {
  id: BadgeId;
  earned: boolean;
  progress: number; // capped at goal
  goal: number;
}

// A badge is earned once its stat reaches the goal, and stays earned if it was earned before.
export function evaluateBadges(stats: BadgeStats, alreadyEarned: readonly BadgeId[] = []): BadgeProgress[] {
  const value: Record<BadgeId, number> = {
    "first-float": stats.goalsCreated,
    "chill-streak": stats.streak,
    "yuzu-master": stats.challengesCompleted,
  };
  return BADGE_ORDER.map((id) => {
    const goal = BADGES[id].goal;
    const earned = alreadyEarned.includes(id) || value[id] >= goal;
    return { id, earned, progress: earned ? goal : Math.min(goal, value[id]), goal };
  });
}

// rateLimits/{uid} (server-only): LLM calls in the last hour, for the per-user limit.
export interface RateLimitDoc {
  llmCalls: IsoDateTime[];
}

// scoreViewers/{uid} (server-only): everyone who shares at least one group with uid.
// Kept in sync from groups/* so security rules can check score access with a single get().
export interface ScoreViewersDoc {
  uids: string[];
}

// ---------- Avatar shop ----------

export type AvatarSlot = "outfit" | "hat" | "glasses" | "held";
export const AVATAR_SLOTS: readonly AvatarSlot[] = ["outfit", "hat", "glasses", "held"];

export type ItemId = "sunglasses" | "yuzu-hat" | "straw-hat" | "scarf" | "matcha" | "bubble-tea" | "flower-crown" | "tiny-crown";

// Prices live here so the server, not the client, decides what things cost. The pixel art is in web/src/avatar.
export const SHOP_ITEMS: Record<ItemId, { name: string; slot: AvatarSlot; price: number }> = {
  sunglasses: { name: "Sunglasses", slot: "glasses", price: 0 },
  "yuzu-hat": { name: "Yuzu hat", slot: "hat", price: 50 },
  "straw-hat": { name: "Straw hat", slot: "hat", price: 80 },
  scarf: { name: "Scarf", slot: "outfit", price: 60 },
  matcha: { name: "Matcha drink", slot: "held", price: 40 },
  "bubble-tea": { name: "Bubble tea", slot: "held", price: 40 },
  "flower-crown": { name: "Flower crown", slot: "hat", price: 100 },
  "tiny-crown": { name: "Tiny crown", slot: "hat", price: 250 },
};
export const ITEM_ORDER = Object.keys(SHOP_ITEMS) as ItemId[];

export const STARTER_ITEMS: readonly ItemId[] = ["sunglasses"]; // free and always owned
export type EquippedAvatar = Partial<Record<AvatarSlot, ItemId>>;
export const DEFAULT_AVATAR: EquippedAvatar = { glasses: "sunglasses" }; // matches the mascot

export const isItemId = (v: unknown): v is ItemId => typeof v === "string" && v in SHOP_ITEMS;
export const isAvatarSlot = (v: unknown): v is AvatarSlot => typeof v === "string" && (AVATAR_SLOTS as readonly string[]).includes(v);

export function ownedItems(inventory: readonly ItemId[] = []): ItemId[] {
  return ITEM_ORDER.filter((id) => STARTER_ITEMS.includes(id) || inventory.includes(id));
}

export type PurchaseCheck = { ok: true; coins: number; inventory: ItemId[] } | { ok: false; reason: "owned" | "insufficient-coins" };

// The purchase rules, shared by the purchaseItem callable and the mock so they can't disagree.
export function checkPurchase(coins: number, inventory: readonly ItemId[] = [], itemId: ItemId): PurchaseCheck {
  if (ownedItems(inventory).includes(itemId)) return { ok: false, reason: "owned" };
  const price = SHOP_ITEMS[itemId].price;
  if (coins < price) return { ok: false, reason: "insufficient-coins" };
  return { ok: true, coins: coins - price, inventory: [...inventory, itemId] };
}

export type EquipCheck = { ok: true; avatar: EquippedAvatar } | { ok: false; reason: "not-owned" | "wrong-slot" };

// itemId null takes off whatever is in that slot.
export function checkEquip(avatar: EquippedAvatar, inventory: readonly ItemId[] = [], slot: AvatarSlot, itemId: ItemId | null): EquipCheck {
  if (itemId === null) {
    const { [slot]: _, ...rest } = avatar;
    return { ok: true, avatar: rest };
  }
  if (SHOP_ITEMS[itemId].slot !== slot) return { ok: false, reason: "wrong-slot" };
  if (!ownedItems(inventory).includes(itemId)) return { ok: false, reason: "not-owned" };
  return { ok: true, avatar: { ...avatar, [slot]: itemId } };
}

// ---------- Callables ----------

export type EmptyRequest = Record<string, never>;

// getSafeToSave
export type GetSafeToSaveRequest = EmptyRequest;

export interface UpcomingBill {
  merchant: string;
  amount: Cents;
  dueDate: IsoDate;
}

// amount = max(0, currentBalance + expectedIncome - upcomingBillsTotal - projectedSpending - safetyBuffer)
export interface SafeToSaveBreakdown {
  currentBalance: Cents;
  expectedIncome: Cents; // conservative income expected before nextPayday (irregular earners only; otherwise 0)
  upcomingBillsTotal: Cents; // sum of upcomingBills, due on or before nextPayday
  upcomingBills: UpcomingBill[];
  projectedSpending: Cents; // forecast discretionary spend until nextPayday
  safetyBuffer: Cents;
}

// One day of the "left over" track record (end-of-day values).
export interface SafeToSaveHistoryPoint {
  date: IsoDate;
  amount: Cents; // what safe-to-save was that day
  balance: Cents; // checking balance that day
}

export interface GetSafeToSaveResponse {
  amount: Cents;
  explanation: string[]; // short bullet sentences, coach voice
  explanationSource: TextSource;
  nextPayday: IsoDate;
  breakdown: SafeToSaveBreakdown;
  // Last ~30 days ending today, oldest first. Optional: the web app hides the chart until it's filled
  // (logic/safeToSaveHistory.ts already has safeToSaveOn and balanceOn for this).
  history?: SafeToSaveHistoryPoint[];
}

// getChallenges: returns the caller's open (active or accepted) challenges, generating them if needed.
export type GetChallengesRequest = EmptyRequest;

export interface GetChallengesResponse {
  challenges: WithId<ChallengeDoc>[];
}

// completeChallenge
// acceptChallenge: active → accepted. Accepting twice is a no-op.
export interface AcceptChallengeRequest {
  challengeId: string;
}

export interface AcceptChallengeResponse {
  challenge: WithId<ChallengeDoc>;
}

export interface CompleteChallengeRequest {
  challengeId: string;
}

export interface CompleteChallengeResponse {
  challenge: WithId<ChallengeDoc>;
  pointsAwarded: number;
  score: ScoreDoc; // caller's score after the update
  leveledUp: boolean;
}

// getLeaderboard
export interface GetLeaderboardRequest {
  groupId: string;
}

export interface LeaderboardEntry extends ScoreDoc {
  displayName: string;
  rank: number; // 1-based, ordered by blended score (points + improvementScore + 10 × streak) desc
  isMe: boolean;
}

export interface GetLeaderboardResponse {
  group: { id: string; name: string; inviteCode: string };
  entries: LeaderboardEntry[];
}

// joinGroup
export interface JoinGroupRequest {
  inviteCode: string; // case and spaces/dashes are ignored
}

export interface JoinGroupResponse {
  group: GroupSummary;
  alreadyMember: boolean;
}

// purchaseItem: spends coins on a shop item. The only way coins go down or inventory grows.
export interface PurchaseItemRequest {
  itemId: ItemId;
}

export interface PurchaseItemResponse {
  coins: number; // balance after buying
  owned: ItemId[]; // everything owned, starter items included
}

// equipItem: puts an owned item in a slot (itemId null takes it off). Saved on scores/{uid} so the group sees it.
export interface EquipItemRequest {
  slot: AvatarSlot;
  itemId: ItemId | null;
}

export interface EquipItemResponse {
  avatar: EquippedAvatar;
}

// Name → request/response map, for a typed client helper.
export interface Callables {
  getSafeToSave: { request: GetSafeToSaveRequest; response: GetSafeToSaveResponse };
  getChallenges: { request: GetChallengesRequest; response: GetChallengesResponse };
  acceptChallenge: { request: AcceptChallengeRequest; response: AcceptChallengeResponse };
  completeChallenge: { request: CompleteChallengeRequest; response: CompleteChallengeResponse };
  getLeaderboard: { request: GetLeaderboardRequest; response: GetLeaderboardResponse };
  joinGroup: { request: JoinGroupRequest; response: JoinGroupResponse };
  purchaseItem: { request: PurchaseItemRequest; response: PurchaseItemResponse };
  equipItem: { request: EquipItemRequest; response: EquipItemResponse };
}
export type CallableName = keyof Callables;

// Dev-only smoke check used by the placeholder page.
export interface HealthResponse {
  ok: true;
  time: string;
}
