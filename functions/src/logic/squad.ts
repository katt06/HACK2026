// Squad goals: one shared goal per group. Pure functions; squadGoals.ts does the Firestore part.
// Privacy (CLAUDE.md): members never see dollar amounts, only progress %, milestones, and who chipped in.
import {
  SQUAD_MILESTONES,
  SQUAD_MILESTONE_POINTS,
  type Cents,
  type ContributionEntry,
  type GroupDoc,
  type IsoDate,
  type SquadContributionDoc,
  type SquadGoalDoc,
  type SquadGoalSummary,
} from "../contract.js";
import { addDays } from "./dates.js";
import type { GoalWithEntries } from "./scoring.js";
import { startOfWeek } from "./scoring.js";

export const SQUAD_NAME_MAX = 60;
export const SQUAD_MIN_TARGET: Cents = 1000; // $10
export const SQUAD_MAX_TARGET: Cents = 10_000_000; // $100,000

// Rounded down, so 49.9% never shows as 50% before the 50% milestone is actually reached.
export function squadProgressPct(squad: Pick<SquadGoalDoc, "currentAmount" | "targetAmount">): number {
  if (squad.targetAmount <= 0) return 0;
  return Math.min(100, Math.floor((100 * squad.currentAmount) / squad.targetAmount));
}

export function milestonesReached(squad: Pick<SquadGoalDoc, "currentAmount" | "targetAmount">): number[] {
  return SQUAD_MILESTONES.filter((m) => squad.currentAmount * 100 >= m * squad.targetAmount);
}

// Milestones crossed by going from `before` to `after` (for "you unlocked 50%!" moments).
export function newMilestones(target: Cents, before: Cents, after: Cents): number[] {
  const reachedBefore = new Set(milestonesReached({ currentAmount: before, targetAmount: target }));
  return milestonesReached({ currentAmount: after, targetAmount: target }).filter((m) => !reachedBefore.has(m));
}

// Everyone in the squad earns the bonus for each milestone, contributors or not: it's a team reward.
export function squadBonusPoints(squads: Pick<SquadGoalDoc, "currentAmount" | "targetAmount">[]): number {
  return squads.reduce((sum, s) => sum + milestonesReached(s).length * SQUAD_MILESTONE_POINTS, 0);
}

// Returns an error message, or null if the new squad goal is valid.
export function validateSquadGoal(input: { name?: unknown; targetAmount?: unknown; deadline?: unknown }, today: IsoDate): string | null {
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (name.length === 0 || name.length > SQUAD_NAME_MAX) return `Name must be 1–${SQUAD_NAME_MAX} characters.`;
  const target = input.targetAmount;
  if (!Number.isInteger(target) || (target as number) < SQUAD_MIN_TARGET || (target as number) > SQUAD_MAX_TARGET) {
    return "Target must be between $10 and $100,000.";
  }
  if (typeof input.deadline !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(input.deadline) || input.deadline <= today) {
    return "Deadline must be a future date (YYYY-MM-DD).";
  }
  return null;
}

// The members' view. Only the viewer's own total is in dollars.
export function squadSummary(
  groupId: string,
  squad: SquadGoalDoc,
  contributions: SquadContributionDoc[],
  group: Pick<GroupDoc, "members" | "memberNames">,
  viewerUid: string,
  today: IsoDate,
): SquadGoalSummary {
  const weekStart = startOfWeek(today);
  return {
    groupId,
    name: squad.name,
    deadline: squad.deadline,
    progressPct: squadProgressPct(squad),
    milestonesReached: milestonesReached(squad),
    isComplete: squad.completedAt !== null,
    createdByMe: squad.createdBy === viewerUid,
    myContributed: contributions.filter((c) => c.userId === viewerUid).reduce((s, c) => s + c.amount, 0),
    members: group.members.map((userId) => {
      const mine = contributions.filter((c) => c.userId === userId);
      return {
        userId,
        displayName: group.memberNames[userId] ?? "Member",
        isMe: userId === viewerUid,
        contributions: mine.length,
        contributedThisWeek: mine.some((c) => c.createdAt.slice(0, 10) >= weekStart && c.createdAt.slice(0, 10) <= addDays(weekStart, 6)),
      };
    }),
  };
}

// For a member's weekly streak, a squad goal acts like a personal goal for their fair share
// (target ÷ members), funded by their own contributions. It only joins their weekly target from the week
// after their first contribution, so members who never opted in can't have their streak broken by it.
export function squadShareGoal(squad: SquadGoalDoc, memberCount: number, myContributions: SquadContributionDoc[]): GoalWithEntries | null {
  if (myContributions.length === 0) return null;
  const entries: ContributionEntry[] = myContributions.map((c) => ({
    kind: "contribution",
    amount: c.amount,
    verified: true,
    note: "Squad goal",
    createdAt: c.createdAt,
  }));
  const firstContribution = [...myContributions].map((c) => c.createdAt).sort()[0];
  return {
    goal: {
      targetAmount: Math.ceil(squad.targetAmount / Math.max(1, memberCount)),
      currentAmount: entries.reduce((s, e) => s + e.amount, 0),
      deadline: squad.deadline,
      pausedUntil: null,
      verified: true,
      createdAt: firstContribution,
    },
    entries,
  };
}
