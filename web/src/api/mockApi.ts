// In-memory mock of the callables. State resets on page reload.
import { FirebaseError } from "firebase/app";
import {
  MAX_GROUP_MEMBERS,
  normalizeInviteCode,
  toGroupSummary,
  GOAL_NAME_MAX,
  type ChallengeDoc,
  type CompleteChallengeResponse,
  type GoalDoc,
  type GoalEntryDoc,
  type GetLeaderboardResponse,
  type GetSafeToSaveResponse,
  type GroupDoc,
  type GroupSummary,
  type IsoDate,
  type LeaderboardEntry,
  type ScoreDoc,
  type WithId,
} from "@contract";
import { formatCents } from "../lib/format";
import { addDays as addIsoDays, todayIso } from "../lib/dates";
import { generateInviteCode } from "../lib/inviteCode";
import { DEFAULT_PERSONA, MOCK_GROUPS, PERSONAS, type ChallengeSeed, type Persona, type PersonaId } from "./mockData";
import type { Api, ApiMethod } from "./types";

export interface MockSettings {
  persona: PersonaId; // whose data "me" is
  errorRate: number; // 0–1, chance a call rejects
  failOnly: ApiMethod[]; // limit simulated errors to these methods; empty = all
}

export interface MockOptions {
  settings?: Partial<MockSettings>;
  delayMs?: [min: number, max: number];
  now?: () => Date;
  random?: () => number;
  onSettingsChange?: (settings: MockSettings) => void;
}

export interface MockControls {
  persona(id?: PersonaId): PersonaId;
  errors(rate: number, only?: ApiMethod[]): MockSettings;
  reset(): void;
  status(): MockSettings & { personas: PersonaId[] };
  simulateJoin(persona: PersonaId, groupId?: string): string;
}

interface PersonaState {
  score: ScoreDoc;
  active: WithId<ChallengeDoc>[];
  nextSeed: number; // index into persona.challenges of the next refill
}

// Same ranking as the server (functions/src/logic/scoring.ts): points + improvement + 10 × weekly streak,
// ties by points, then name.
const blended = (s: ScoreDoc) => s.points + s.improvementScore + 10 * s.streak;
function rankLikeServer(rows: Omit<LeaderboardEntry, "rank">[]): LeaderboardEntry[] {
  return [...rows]
    .sort((a, b) => blended(b) - blended(a) || b.points - a.points || a.displayName.localeCompare(b.displayName))
    .map((row, i) => ({ ...row, rank: i + 1 }));
}

export function levelFor(points: number): number {
  return Math.floor(points / 100) + 1;
}

export function uidFor(persona: PersonaId): string {
  return `mock-${persona}`;
}

function isoDate(d: Date): IsoDate {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function addDays(d: Date, days: number): Date {
  const next = new Date(d);
  next.setDate(next.getDate() + days);
  return next;
}

function challengeFrom(p: Persona, seedIndex: number, createdAt: string): WithId<ChallengeDoc> {
  const seed: ChallengeSeed = p.challenges[seedIndex];
  return {
    ...seed,
    id: `${p.id}-${seedIndex + 1}`,
    userId: uidFor(p.id),
    status: "active",
    createdAt,
    completedAt: null,
  };
}

function joinNames(names: string[]): string {
  return names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

export function createMockApi(options: MockOptions = {}): { api: Api; controls: MockControls } {
  const now = options.now ?? (() => new Date());
  const random = options.random ?? Math.random;
  const [minDelay, maxDelay] = options.delayMs ?? [300, 800];
  const settings: MockSettings = { persona: DEFAULT_PERSONA, errorRate: 0, failOnly: [], ...options.settings };
  let state = initialState();
  let groups = initialGroups();
  let goals = initialGoals();

  function initialState(): Map<PersonaId, PersonaState> {
    const createdAt = now().toISOString();
    return new Map(
      PERSONAS.map((p) => [
        p.id,
        {
          score: { ...p.score, userId: uidFor(p.id), level: levelFor(p.score.points) },
          active: [0, 1, 2].map((i) => challengeFrom(p, i, createdAt)),
          nextSeed: 3,
        },
      ]),
    );
  }

  function initialGroups(): Map<string, GroupDoc> {
    return new Map(
      MOCK_GROUPS.map((g) => [
        g.id,
        {
          name: g.name,
          inviteCode: g.inviteCode,
          members: g.members.map(uidFor),
          memberNames: Object.fromEntries(g.members.map((id) => [uidFor(id), PERSONAS.find((p) => p.id === id)!.displayName])),
        },
      ]),
    );
  }

  interface MockGoal {
    goal: GoalDoc;
    entries: WithId<GoalEntryDoc>[]; // newest first
  }

  function initialGoals(): Map<string, MockGoal> {
    const t = now();
    const daysAgo = (n: number) => new Date(t.getTime() - n * 86_400_000).toISOString();
    return new Map(
      PERSONAS.map((p) => {
        const contributions = [...p.goal.contributions].sort((a, b) => a.daysAgo - b.daysAgo);
        const goal: GoalDoc = {
          ownerId: uidFor(p.id),
          name: p.goal.name,
          targetAmount: p.goal.targetAmount,
          currentAmount: contributions.reduce((sum, c) => sum + c.amount, 0),
          deadline: addIsoDays(todayIso(t), p.goal.deadlineInDays),
          verified: false,
          sizingRecommendation: null,
          pausedUntil: null,
          createdAt: daysAgo(Math.max(...contributions.map((c) => c.daysAgo)) + 1),
        };
        const entries = contributions.map((c, i): WithId<GoalEntryDoc> => ({
          id: `${p.id}-entry-${i + 1}`,
          kind: "contribution",
          amount: c.amount,
          verified: c.verified,
          note: c.note,
          createdAt: daysAgo(c.daysAgo),
        }));
        return [`${p.id}-goal`, { goal, entries }];
      }),
    );
  }

  // Missing and not-mine look the same, like Firestore rules.
  function myGoal(goalId: string): MockGoal {
    const g = goals.get(goalId);
    if (!g || g.goal.ownerId !== uidFor(settings.persona)) throw new FirebaseError("not-found", "Goal not found.");
    return g;
  }

  let entryCount = 0;
  const addEntry = (g: MockGoal, entry: GoalEntryDoc) => g.entries.unshift({ ...entry, id: `mock-entry-${++entryCount}` });

  const groupSummary = (id: string): GroupSummary => toGroupSummary(id, groups.get(id)!, uidFor(settings.persona));
  const myGroupIds = () => [...groups.keys()].filter((id) => groups.get(id)!.members.includes(uidFor(settings.persona)));

  // watchMyGroups subscribers, notified after every group change (like a Firestore listener).
  const watchers = new Set<(groups: GroupSummary[]) => void>();
  const notify = () => watchers.forEach((w) => w(structuredClone(myGroupIds().map(groupSummary))));

  const persona = (): Persona => PERSONAS.find((p) => p.id === settings.persona)!;
  const mine = (): PersonaState => state.get(settings.persona)!;

  // Every call goes through here: delay, maybe fail, then return a copy so callers can't mutate state.
  async function respond<T>(method: ApiMethod, produce: () => T): Promise<T> {
    const delay = minDelay + random() * (maxDelay - minDelay);
    if (delay > 0) await new Promise((r) => setTimeout(r, delay));
    const eligible = settings.failOnly.length === 0 || settings.failOnly.includes(method);
    if (eligible && random() < settings.errorRate) {
      throw new FirebaseError("functions/unavailable", `Simulated ${method} failure (mock API).`);
    }
    return structuredClone(produce());
  }

  const api: Api = {
    getSafeToSave: () =>
      respond("getSafeToSave", (): GetSafeToSaveResponse => {
        const p = persona();
        const today = now();
        const payday = addDays(today, p.paydayInDays);
        const upcomingBills = p.bills.map((b) => ({
          merchant: b.merchant,
          amount: b.amount,
          dueDate: isoDate(addDays(today, b.dueInDays)),
        }));
        const upcomingBillsTotal = upcomingBills.reduce((sum, b) => sum + b.amount, 0);
        const amount = Math.max(0, p.currentBalance - upcomingBillsTotal - p.projectedSpending - p.safetyBuffer);
        const paydayText = payday.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });

        return {
          amount,
          explanation: [
            `You have ${formatCents(p.currentBalance)} in checking, and your next paycheck should land ${paydayText}.`,
            `${joinNames(p.bills.map((b) => b.merchant))} (${formatCents(upcomingBillsTotal)}) ${p.bills.length === 1 ? "is" : "are"} due before then, so we set that aside first.`,
            `Based on your usual spending, about ${formatCents(p.projectedSpending)} covers everything else until payday.`,
            p.insight,
            amount > 0
              ? `After a ${formatCents(p.safetyBuffer)} cushion, you have ${formatCents(amount)} in remaining money you could move to your goal.`
              : `After a ${formatCents(p.safetyBuffer)} cushion there's no remaining money this time, and that's okay.`,
          ],
          explanationSource: "template",
          nextPayday: isoDate(payday),
          breakdown: {
            currentBalance: p.currentBalance,
            expectedIncome: 0,
            upcomingBillsTotal,
            upcomingBills,
            projectedSpending: p.projectedSpending,
            safetyBuffer: p.safetyBuffer,
          },
          history: [], // TODO(frontend): mock data for the remaining-money chart
          trackRecord: null,
        };
      }),

    getChallenges: () => respond("getChallenges", () => ({ challenges: mine().active })),

    getMyScore: () => respond("getMyScore", () => mine().score),

    acceptChallenge: (challengeId) =>
      respond("acceptChallenge", () => {
        const c = mine().active.find((x) => x.id === challengeId);
        if (!c) throw new FirebaseError("functions/not-found", "Challenge not found.");
        c.status = "accepted";
        return { challenge: c };
      }),

    completeChallenge: (challengeId) =>
      respond("completeChallenge", (): CompleteChallengeResponse => {
        const s = mine();
        const index = s.active.findIndex((c) => c.id === challengeId);
        if (index === -1) throw new FirebaseError("functions/not-found", "Challenge not found.");

        const timestamp = now();
        const challenge: WithId<ChallengeDoc> = {
          ...s.active[index],
          status: "completed",
          completedAt: timestamp.toISOString(),
        };

        // Challenges earn points. The streak is weekly saving, so it doesn't move here.
        const levelBefore = s.score.level;
        const points = s.score.points + challenge.points;
        s.score = { ...s.score, points, level: levelFor(points) };

        // Replace the completed challenge with the next seed, if any are left.
        const p = persona();
        const refill = s.nextSeed < p.challenges.length ? [challengeFrom(p, s.nextSeed++, timestamp.toISOString())] : [];
        s.active = [...s.active.slice(0, index), ...refill, ...s.active.slice(index + 1)];

        return { challenge, pointsAwarded: challenge.points, score: s.score, leveledUp: s.score.level > levelBefore };
      }),

    getLeaderboard: (groupId) =>
      respond("getLeaderboard", (): GetLeaderboardResponse => {
        const group = groups.get(groupId) ?? groups.get(MOCK_GROUPS[0].id)!;
        const rows = PERSONAS.filter((p) => group.members.includes(uidFor(p.id))).map((p) => ({
          ...state.get(p.id)!.score,
          displayName: p.displayName,
          isMe: p.id === settings.persona,
        }));
        return {
          group: { id: groupId, name: group.name, inviteCode: group.inviteCode },
          entries: rankLikeServer(rows),
        };
      }),

    getMyGroups: () => respond("getMyGroups", () => myGroupIds().map(groupSummary)),

    watchMyGroups(onChange, onError) {
      let active = true;
      const watcher = (next: GroupSummary[]) => active && onChange(next);
      respond("watchMyGroups", () => myGroupIds().map(groupSummary)).then(
        (initial) => {
          if (!active) return;
          watchers.add(watcher);
          onChange(initial);
        },
        (err) => active && onError(err),
      );
      return () => {
        active = false;
        watchers.delete(watcher);
      };
    },

    createGroup: (name) =>
      respond("createGroup", () => {
        const trimmed = name.trim();
        if (trimmed.length < 1 || trimmed.length > 40) {
          throw new FirebaseError("permission-denied", "Group names must be 1–40 characters.");
        }
        let inviteCode = generateInviteCode();
        while ([...groups.values()].some((g) => g.inviteCode === inviteCode)) inviteCode = generateInviteCode();
        const id = `mock-group-${groups.size + 1}`;
        const me = uidFor(settings.persona);
        groups.set(id, { name: trimmed, inviteCode, members: [me], memberNames: { [me]: persona().displayName } });
        notify();
        return groupSummary(id);
      }),

    joinGroup: (rawCode) =>
      respond("joinGroup", () => {
        const code = normalizeInviteCode(rawCode);
        if (!code) throw new FirebaseError("functions/invalid-argument", "Invite codes are 6 letters and numbers.");
        const id = [...groups.keys()].find((key) => groups.get(key)!.inviteCode === code);
        if (!id) throw new FirebaseError("functions/not-found", "No group uses that invite code.");
        const group = groups.get(id)!;
        const me = uidFor(settings.persona);
        const alreadyMember = group.members.includes(me);
        if (!alreadyMember) {
          if (group.members.length >= MAX_GROUP_MEMBERS) throw new FirebaseError("functions/failed-precondition", "This group is full.");
          group.members.push(me);
          group.memberNames[me] = persona().displayName;
          notify();
        }
        return { group: groupSummary(id), alreadyMember };
      }),

    getMyGoals: () =>
      respond("getMyGoals", () =>
        [...goals.entries()]
          .filter(([, g]) => g.goal.ownerId === uidFor(settings.persona))
          .map(([id, g]) => ({ ...g.goal, id }))
          .sort((a, b) => a.deadline.localeCompare(b.deadline)),
      ),

    getGoal: (goalId) =>
      respond("getGoal", () => {
        const g = myGoal(goalId);
        return { goal: { ...g.goal, id: goalId }, entries: g.entries };
      }),

    createGoal: ({ name, targetAmount, deadline }) =>
      respond("createGoal", () => {
        const trimmed = name.trim();
        const valid =
          trimmed.length > 0 && trimmed.length <= GOAL_NAME_MAX && Number.isInteger(targetAmount) && targetAmount > 0 && deadline > todayIso(now());
        if (!valid) throw new FirebaseError("permission-denied", "Invalid goal.");
        const id = `mock-goal-${goals.size + 1}`;
        const goal: GoalDoc = {
          ownerId: uidFor(settings.persona),
          name: trimmed,
          targetAmount,
          currentAmount: 0,
          deadline,
          verified: false,
          sizingRecommendation: null,
          pausedUntil: null,
          createdAt: now().toISOString(),
        };
        goals.set(id, { goal, entries: [] });
        return { ...goal, id };
      }),

    addContribution: (goalId, amount, note = "") =>
      respond("addContribution", () => {
        if (!Number.isInteger(amount) || amount <= 0) throw new FirebaseError("permission-denied", "Invalid amount.");
        const g = myGoal(goalId);
        g.goal.currentAmount += amount;
        addEntry(g, { kind: "contribution", amount, verified: false, note: note.trim(), createdAt: now().toISOString() });
      }),

    applyGoalFlex: (goalId, expenseAmount, option, note = "") =>
      respond("applyGoalFlex", () => {
        const g = myGoal(goalId);
        g.goal.deadline = option.newDeadline;
        g.goal.pausedUntil = option.pausedUntil;
        addEntry(g, {
          kind: "expense",
          amount: expenseAmount,
          choice: option.choice,
          weeksLater: option.weeksLater,
          note: note.trim(),
          createdAt: now().toISOString(),
        });
      }),
  };

  const changed = () => options.onSettingsChange?.({ ...settings, failOnly: [...settings.failOnly] });

  const controls: MockControls = {
    persona(id) {
      if (id) {
        if (!PERSONAS.some((p) => p.id === id)) throw new Error(`Unknown persona "${id}"`);
        settings.persona = id;
        changed();
        notify();
      }
      return settings.persona;
    },
    errors(rate, only = []) {
      settings.errorRate = Math.min(1, Math.max(0, rate));
      settings.failOnly = only;
      changed();
      return { ...settings };
    },
    reset() {
      state = initialState();
      groups = initialGroups();
      goals = initialGoals();
      notify();
    },
    status() {
      return { ...settings, personas: PERSONAS.map((p) => p.id) };
    },
    // Another persona joins one of my groups (default: the one I joined or created most recently).
    simulateJoin(id, groupId = myGroupIds().at(-1)) {
      const joiner = PERSONAS.find((p) => p.id === id);
      if (!joiner) throw new Error(`Unknown persona "${id}"`);
      const group = groupId ? groups.get(groupId) : undefined;
      if (!group) throw new Error("No group to join. Create one first, or pass a group id.");
      const uid = uidFor(id);
      if (group.members.includes(uid)) throw new Error(`${joiner.displayName} is already in ${group.name}.`);
      group.members.push(uid);
      group.memberNames[uid] = joiner.displayName;
      notify();
      return `${joiner.displayName} joined ${group.name}`;
    },
  };

  return { api, controls };
}
