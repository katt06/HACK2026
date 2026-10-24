import type {
  CompleteChallengeResponse,
  GetChallengesResponse,
  GetLeaderboardResponse,
  GetSafeToSaveResponse,
  GoalDoc,
  GoalEntryDoc,
  GroupSummary,
  IsoDate,
  JoinGroupResponse,
  WithId,
} from "@contract";
import type { FlexOption } from "../lib/goalMath";

export interface NewGoal {
  name: string; // 1–60 chars after trimming
  targetAmount: number; // cents, > 0
  deadline: IsoDate; // after today
}

export interface GoalDetail {
  goal: WithId<GoalDoc>;
  entries: WithId<GoalEntryDoc>[]; // newest first
}

// The one interface both implementations satisfy. Components only see this.
export interface Api {
  getSafeToSave(): Promise<GetSafeToSaveResponse>;
  getChallenges(): Promise<GetChallengesResponse>;
  completeChallenge(challengeId: string): Promise<CompleteChallengeResponse>;
  getLeaderboard(groupId: string): Promise<GetLeaderboardResponse>;

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
