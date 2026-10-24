// Fixed fixture data returned by the callable stubs until the real logic lands.
import type {
  ChallengeDoc,
  CompleteChallengeResponse,
  GetChallengesResponse,
  GetLeaderboardResponse,
  LeaderboardEntry,
  WithId,
} from "./contract.js";

const challenges: WithId<ChallengeDoc>[] = [
  {
    id: "stub-challenge-1",
    userId: "",
    type: "brew_at_home",
    description: "Make coffee at home three mornings this week.",
    points: 30,
    difficulty: "easy",
    status: "active",
    createdAt: "2026-10-24T13:00:00.000Z",
    completedAt: null,
    reason: "Coffee shops were about $48 last week, above your usual $30.",
  },
  {
    id: "stub-challenge-2",
    userId: "",
    type: "no_spend_day",
    description: "Pick one day before Sunday with zero non-essential spending.",
    points: 50,
    difficulty: "medium",
    status: "active",
    createdAt: "2026-10-24T13:00:00.000Z",
    completedAt: null,
    reason: "You've finished two easy challenges in a row, so here's a step up.",
  },
  {
    id: "stub-challenge-3",
    userId: "",
    type: "subscription_review",
    description: "Review your 4 streaming subscriptions and pause one you haven't used this month.",
    points: 80,
    difficulty: "hard",
    status: "active",
    createdAt: "2026-10-24T13:00:00.000Z",
    completedAt: null,
    reason: "Subscriptions are your fastest-growing category over the last 3 months.",
  },
];

export function challengesStub(uid: string): GetChallengesResponse {
  return { challenges: challenges.map((c) => ({ ...c, userId: uid })) };
}

// Returns null when the id isn't one of the stub challenges.
export function completeChallengeStub(uid: string, challengeId: string): CompleteChallengeResponse | null {
  const challenge = challenges.find((c) => c.id === challengeId);
  if (!challenge) return null;
  return {
    challenge: {
      ...challenge,
      userId: uid,
      status: "completed",
      completedAt: "2026-10-24T18:30:00.000Z",
    },
    pointsAwarded: challenge.points,
    score: {
      userId: uid,
      goalProgressPct: 42,
      streak: 4,
      improvementScore: 63,
      points: 260 + challenge.points,
      level: 3,
    },
    leveledUp: 260 + challenge.points >= 300,
  };
}

const leaderboardRows: Omit<LeaderboardEntry, "isMe">[] = [
  { userId: "stub-user-maya", displayName: "Maya", rank: 1, goalProgressPct: 68, streak: 9, improvementScore: 81, points: 540, level: 5 },
  { userId: "stub-user-me", displayName: "You", rank: 2, goalProgressPct: 42, streak: 4, improvementScore: 63, points: 260, level: 3 },
  { userId: "stub-user-jordan", displayName: "Jordan", rank: 3, goalProgressPct: 35, streak: 2, improvementScore: 57, points: 190, level: 2 },
  { userId: "stub-user-sam", displayName: "Sam", rank: 4, goalProgressPct: 12, streak: 0, improvementScore: 40, points: 70, level: 1 },
];

export function leaderboardStub(uid: string, groupId: string): GetLeaderboardResponse {
  return {
    group: { id: groupId, name: "Roommates Savings Squad", inviteCode: "SAVE42" },
    entries: leaderboardRows.map((row) =>
      row.userId === "stub-user-me" ? { ...row, userId: uid, isMe: true } : { ...row, isMe: false },
    ),
  };
}
