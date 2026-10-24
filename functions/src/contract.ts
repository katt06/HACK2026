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
export type ChallengeStatus = "active" | "completed" | "skipped" | "expired";

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
  points: number;
  level: number; // starts at 1
}

// scoreViewers/{uid} (server-only): everyone who shares at least one group with uid.
// Kept in sync from groups/* so security rules can check score access with a single get().
export interface ScoreViewersDoc {
  uids: string[];
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

export interface GetSafeToSaveResponse {
  amount: Cents;
  explanation: string[]; // short bullet sentences, coach voice
  explanationSource: TextSource;
  nextPayday: IsoDate;
  breakdown: SafeToSaveBreakdown;
}

// getChallenges: returns the caller's active challenges, generating them if needed.
export type GetChallengesRequest = EmptyRequest;

export interface GetChallengesResponse {
  challenges: WithId<ChallengeDoc>[];
}

// completeChallenge
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

// Name → request/response map, for a typed client helper.
export interface Callables {
  getSafeToSave: { request: GetSafeToSaveRequest; response: GetSafeToSaveResponse };
  getChallenges: { request: GetChallengesRequest; response: GetChallengesResponse };
  completeChallenge: { request: CompleteChallengeRequest; response: CompleteChallengeResponse };
  getLeaderboard: { request: GetLeaderboardRequest; response: GetLeaderboardResponse };
  joinGroup: { request: JoinGroupRequest; response: JoinGroupResponse };
}
export type CallableName = keyof Callables;

// Dev-only smoke check used by the placeholder page.
export interface HealthResponse {
  ok: true;
  time: string;
}
