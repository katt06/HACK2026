// Shared contract between /web and /functions.
// The web app imports this file type-only via the `@contract` alias,
// so the only runtime values allowed here are plain constants.
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
  verified: boolean; // currentAmount confirmed against linked account data
  sizingRecommendation: SizingRecommendation | null;
}

// transactions/{id} (server-only)
export interface TransactionDoc {
  userId: string;
  amount: Cents; // positive = money out
  category: Category;
  merchant: string;
  date: IsoDate;
  recurringId: string | null;
}

// recurring/{id} (server-only)
export interface RecurringDoc {
  userId: string;
  merchant: string;
  amount: Cents;
  cadence: Cadence;
  nextDue: IsoDate;
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

// scores/{uid}. Readable by group members, so never put dollar amounts here.
export interface ScoreDoc {
  userId: string;
  goalProgressPct: number; // 0–100
  streak: number; // consecutive days with a completed challenge
  improvementScore: number; // 0–100, spending vs. baseline
  points: number;
  level: number; // starts at 1
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

// amount = max(0, currentBalance - upcomingBillsTotal - projectedSpending - safetyBuffer)
export interface SafeToSaveBreakdown {
  currentBalance: Cents;
  upcomingBillsTotal: Cents; // sum of upcomingBills, due before nextPayday
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
  rank: number; // 1-based, ordered by points desc
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
