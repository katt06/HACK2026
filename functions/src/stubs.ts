// Fixed fixture data returned by the callable stubs until the real logic lands.
import type {
  AcceptChallengeResponse,
  ChallengeDoc,
  CompleteChallengeResponse,
  GetChallengesResponse,
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
export function acceptChallengeStub(uid: string, challengeId: string): AcceptChallengeResponse | null {
  const challenge = challenges.find((c) => c.id === challengeId);
  return challenge ? { challenge: { ...challenge, userId: uid, status: "accepted" } } : null;
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
