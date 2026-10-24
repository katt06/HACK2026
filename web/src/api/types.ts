import type {
  CompleteChallengeResponse,
  GetChallengesResponse,
  GetLeaderboardResponse,
  GetSafeToSaveResponse,
  GroupSummary,
  JoinGroupResponse,
} from "@contract";

// The one interface both implementations satisfy. Components only see this.
export interface Api {
  getSafeToSave(): Promise<GetSafeToSaveResponse>;
  getChallenges(): Promise<GetChallengesResponse>;
  completeChallenge(challengeId: string): Promise<CompleteChallengeResponse>;
  getLeaderboard(groupId: string): Promise<GetLeaderboardResponse>;

  getMyGroups(): Promise<GroupSummary[]>;
  createGroup(name: string): Promise<GroupSummary>; // name: 1–40 chars after trimming
  joinGroup(inviteCode: string): Promise<JoinGroupResponse>;
}

export type ApiMethod = keyof Api;
