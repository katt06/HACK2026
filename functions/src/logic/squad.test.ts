import { describe, expect, it } from "vitest";
import { generateSeedData } from "../../../scripts/seedData.js";
import type { SquadContributionDoc, SquadGoalDoc } from "../contract.js";
import { computeScore } from "./scoring.js";
import {
  milestonesReached,
  newMilestones,
  squadBonusPoints,
  squadProgressPct,
  squadShareGoal,
  squadSummary,
  validateSquadGoal,
} from "./squad.js";

const TODAY = "2026-10-24"; // Saturday; week starts Mon Oct 19
const squad = (currentAmount: number, overrides: Partial<SquadGoalDoc> = {}): SquadGoalDoc => ({
  groupId: "g1",
  name: "Cabin trip",
  targetAmount: 200000,
  currentAmount,
  deadline: "2027-02-01",
  createdBy: "a",
  createdAt: "2026-10-19T09:00:00.000Z",
  completedAt: null,
  ...overrides,
});
const contribution = (userId: string, amount: number, date: string): SquadContributionDoc => ({ userId, amount, createdAt: `${date}T12:00:00.000Z` });
const group = { members: ["a", "b", "c"], memberNames: { a: "Ana", b: "Ben", c: "Cy" } };

describe("progress and milestones", () => {
  it("rounds progress down so a milestone never shows early", () => {
    expect(squadProgressPct(squad(99999))).toBe(49);
    expect(squadProgressPct(squad(100000))).toBe(50);
    expect(squadProgressPct(squad(300000))).toBe(100);
  });

  it("lists milestones reached and the ones a contribution unlocks", () => {
    expect(milestonesReached(squad(75000))).toEqual([25]);
    expect(milestonesReached(squad(200000))).toEqual([25, 50, 75, 100]);
    expect(newMilestones(200000, 75000, 160000)).toEqual([50, 75]);
    expect(newMilestones(200000, 75000, 80000)).toEqual([]);
  });

  it("gives every member 25 points per milestone", () => {
    expect(squadBonusPoints([squad(75000), squad(100000)])).toBe(25 + 50);
    expect(squadBonusPoints([])).toBe(0);
  });
});

describe("validateSquadGoal", () => {
  it.each([
    [{ name: "Cabin trip", targetAmount: 200000, deadline: "2027-01-01" }, null],
    [{ name: "  ", targetAmount: 200000, deadline: "2027-01-01" }, "Name must be 1–60 characters."],
    [{ name: "x".repeat(61), targetAmount: 200000, deadline: "2027-01-01" }, "Name must be 1–60 characters."],
    [{ name: "Trip", targetAmount: 500, deadline: "2027-01-01" }, "Target must be between $10 and $100,000."],
    [{ name: "Trip", targetAmount: 1999.5, deadline: "2027-01-01" }, "Target must be between $10 and $100,000."],
    [{ name: "Trip", targetAmount: 200000, deadline: TODAY }, "Deadline must be a future date (YYYY-MM-DD)."],
    [{ name: "Trip", targetAmount: 200000, deadline: "next week" }, "Deadline must be a future date (YYYY-MM-DD)."],
  ])("%j → %j", (input, error) => {
    expect(validateSquadGoal(input, TODAY)).toBe(error);
  });
});

describe("squadSummary (what members see)", () => {
  const contributions = [contribution("a", 50000, "2026-10-20"), contribution("b", 25000, "2026-10-12"), contribution("a", 10000, "2026-10-22")];
  const summary = squadSummary("g1", squad(85000), contributions, group, "b", TODAY);

  it("shows progress, milestones, and who chipped in, but only the viewer's own dollars", () => {
    expect(summary).toMatchObject({ progressPct: 42, milestonesReached: [25], myContributed: 25000, createdByMe: false, isComplete: false });
    expect(summary.members).toEqual([
      { userId: "a", displayName: "Ana", isMe: false, contributions: 2, contributedThisWeek: true },
      { userId: "b", displayName: "Ben", isMe: true, contributions: 1, contributedThisWeek: false },
      { userId: "c", displayName: "Cy", isMe: false, contributions: 0, contributedThisWeek: false },
    ]);
  });

  it("never includes the target, the total, or anyone else's amounts", () => {
    const text = JSON.stringify(summary);
    for (const amount of ["200000", "85000", "50000", "10000", "60000"]) expect(text).not.toContain(amount);
    expect(Object.keys(summary).sort()).toEqual(
      ["createdByMe", "deadline", "groupId", "isComplete", "members", "milestonesReached", "myContributed", "name", "progressPct"].sort(),
    );
  });
});

describe("squad goals in scores", () => {
  it("counts a member's fair share toward their streak only after they've chipped in", () => {
    expect(squadShareGoal(squad(0), 4, [])).toBeNull();
    const share = squadShareGoal(squad(50000), 4, [contribution("a", 20000, "2026-10-13")])!;
    expect(share.goal).toMatchObject({ targetAmount: 50000, currentAmount: 20000, createdAt: "2026-10-13T12:00:00.000Z" });
  });

  it("adds bonus points but keeps progress % personal", () => {
    const base = { userId: "a", today: TODAY, goals: [], completedChallengePoints: [30], baselineSpendByCategory: {}, transactions: [] };
    expect(computeScore({ ...base, squadBonusPoints: 50 })).toMatchObject({ points: 80, goalProgressPct: 0 });
  });

  it("seeds a Cabin trip past 25% that Alex hasn't joined yet, without changing the designed streaks", () => {
    const data = generateSeedData(TODAY);
    const { squad: cabin, contributions } = data.squadGoals["demo-group"];
    expect(milestonesReached(cabin)).toEqual([25]);
    expect(contributions.some((c) => c.userId === "demo-hero")).toBe(false);
    expect(newMilestones(cabin.targetAmount, cabin.currentAmount, cabin.currentAmount + 25000)).toEqual([50]);
    expect(Object.fromEntries(data.users.map((u) => [u.uid, u.score.streak]))).toEqual({
      "delivery-spender": 2,
      "irregular-income": 5,
      "subscription-creep": 1,
      "steady-saver": 12,
      "demo-hero": 4,
    });
  });
});
