import type {
  AcceptChallengeResponse,
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

  getMyGroups(): Promise<GroupSummary[]>;
  // Live version: calls onChange now and on every change. Returns an unsubscribe function.
  watchMyGroups(onChange: (groups: GroupSummary[]) => void, onError: (err: unknown) => void): () => void;
  createGroup(name: string): Promise<GroupSummary>; // name: 1–40 chars after trimming
  joinGroup(inviteCode: string): Promise<JoinGroupResponse>;

  getMyGoals(): Promise<WithId<GoalDoc>[]>; // soonest deadline first
  getGoal(goalId: string): Promise<GoalDetail>; // rejects with a "not-found" code if missing or not mine
  createGoal(goal: NewGoal): Promise<WithId<GoalDoc>>;
  addContribution(goalId: string, amount: number, note?: string): Promise<void>; // logged as unverified
  applyGoalFlex(goalId: string, expenseAmount: number, option: FlexOption, note?: string): Promise<void>;
}

export type ApiMethod = keyof Api;
