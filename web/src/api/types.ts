import type {
  AcceptChallengeResponse,
  AddToGoalResponse,
  AutoSaveRule,
  ContributeToSquadGoalResponse,
  CreateSquadGoalRequest,
  SetAutoSaveResponse,
  SquadGoalSummary,
  AvatarSlot,
  EquipItemResponse,
  EquippedAvatar,
  ItemId,
  PurchaseItemResponse,
  Cents,
  BadgeProgress,
  CompleteChallengeResponse,
  GetChallengesResponse,
  GetLeaderboardResponse,
  GetSafeToSaveResponse,
  GoalDoc,
  GoalEntryDoc,
  GroupSummary,
  IsoDate,
  IsoDateTime,
  ScoreDoc,
  JoinGroupResponse,
  WithId,
} from "@contract";
import type { FlexOption } from "../lib/goalMath";

export interface NewGoal {
  name: string; // 1–60 chars after trimming
  targetAmount: number; // cents, > 0
  deadline: IsoDate; // after today
}

// The game layer: XP (never decreases; drives level and rank), spendable coins, and badges.
export interface GameState {
  xp: number;
  level: number;
  xpIntoLevel: number;
  xpPerLevel: number;
  coins: number;
  badges: BadgeProgress[];
  avatar: EquippedAvatar; // what my capybara is wearing
  owned: ItemId[]; // shop items I own, starter items included
}

export interface GoalDetail {
  goal: WithId<GoalDoc>;
  entries: WithId<GoalEntryDoc>[]; // newest first
}

// My own history for the activity calendar: finished challenges, money added to goals, and the current streak.
export interface Activity {
  completedChallenges: { id: string; description: string; points: number; completedAt: IsoDateTime }[];
  contributions: { goalName: string; amount: Cents; createdAt: IsoDateTime }[];
  streak: number; // weeks, from my score doc
}

// The one interface both implementations satisfy. Components only see this.
export interface Api {
  getSafeToSave(): Promise<GetSafeToSaveResponse>;
  getChallenges(): Promise<GetChallengesResponse>;
  acceptChallenge(challengeId: string): Promise<AcceptChallengeResponse>;
  completeChallenge(challengeId: string): Promise<CompleteChallengeResponse>;
  getLeaderboard(groupId: string): Promise<GetLeaderboardResponse>;
  getMyScore(): Promise<ScoreDoc | null>; // null until the user has a score doc
  getGameState(): Promise<GameState>;
  getActivity(): Promise<Activity>;

  // Avatar shop. Coins, inventory and the equipped avatar are only ever changed by these server calls.
  purchaseItem(itemId: ItemId): Promise<PurchaseItemResponse>; // rejects "failed-precondition" if owned or too few coins
  equipItem(slot: AvatarSlot, itemId: ItemId | null): Promise<EquipItemResponse>; // null takes the slot off
  getAvatars(uids: string[]): Promise<Record<string, EquippedAvatar>>; // group members' avatars (missing = default)

  getMyGroups(): Promise<GroupSummary[]>;
  // Live version: calls onChange now and on every change. Returns an unsubscribe function.
  watchMyGroups(onChange: (groups: GroupSummary[]) => void, onError: (err: unknown) => void): () => void;
  createGroup(name: string): Promise<GroupSummary>; // name: 1–40 chars after trimming
  joinGroup(inviteCode: string): Promise<JoinGroupResponse>;

  getMyGoals(): Promise<WithId<GoalDoc>[]>; // soonest deadline first
  getGoal(goalId: string): Promise<GoalDetail>; // rejects with a "not-found" code if missing or not mine
  createGoal(goal: NewGoal): Promise<WithId<GoalDoc>>;
  addContribution(goalId: string, amount: number, note?: string): Promise<void>; // logged as unverified
  // Moves money out of the in-app checking balance into the goal. Verified (counts 1.5× toward XP). Rejects
  // "failed-precondition" with a friendly message if it's more than the balance or than the goal still needs.
  addToGoal(goalId: string, amount: number): Promise<AddToGoalResponse>;
  // Payday auto-save, capped at that day's left-over money. null turns it off.
  setAutoSave(goalId: string, rule: AutoSaveRule | null): Promise<SetAutoSaveResponse>;

  // Squad goals: one shared goal per group. Members see progress %, never each other's amounts.
  getSquadGoal(groupId: string): Promise<SquadGoalSummary | null>; // null until the group starts one
  createSquadGoal(input: CreateSquadGoalRequest): Promise<SquadGoalSummary>; // rejects "already-exists" if the group has one
  contributeToSquadGoal(groupId: string, amount: number): Promise<ContributeToSquadGoalResponse>; // from checking
  applyGoalFlex(goalId: string, expenseAmount: number, option: FlexOption, note?: string): Promise<void>;
}

export type ApiMethod = keyof Api;
