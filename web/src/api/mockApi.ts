// In-memory mock of the callables. State resets on page reload.
import { FirebaseError } from "firebase/app";
import {
  MAX_GROUP_MEMBERS,
  evaluateBadges,
  levelProgress,
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
  type SafeToSaveHistoryPoint,
  type ScoreDoc,
  type WithId,
} from "@contract";
import { formatCents } from "../lib/format";
import { addDays as addIsoDays, todayIso } from "../lib/dates";
import { generateInviteCode } from "../lib/inviteCode";
import { DEFAULT_PERSONA, MOCK_GROUPS, PERSONAS, type ChallengeSeed, type Persona, type PersonaId } from "./mockData";
import type { Activity, Api, ApiMethod } from "./types";

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
  coins: number;
  challengesCompleted: number;
  history: Activity["completedChallenges"]; // dated completions for the calendar
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

// Deterministic 0–1 numbers from a string seed (mulberry32), so each persona's history is stable.
function seededRandom(seed: string): () => number {
  let a = [...seed].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 2654435761), 1779033703) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Up to 30 of a persona's lifetime completions, spread over the last 6 weeks (stable per persona).
export function mockChallengeHistory(p: Persona, now: Date): Activity["completedChallenges"] {
  const rand = seededRandom(`${p.id}-challenges`);
  const n = Math.min(p.challengesCompleted, 30);
  return Array.from({ length: n }, (_, i) => {
    const seed = p.challenges[i % p.challenges.length];
    const daysAgo = 1 + Math.floor(((n - 1 - i) * 41) / Math.max(1, n) + rand() * 2);
    const day = addDays(now, -daysAgo);
    day.setHours(9 + Math.floor(rand() * 11), 0, 0, 0);
    return { id: `${p.id}-done-${i + 1}`, description: seed.description, points: seed.points, completedAt: day.toISOString() };
  });
}

// 30 days of balance and left-over ending exactly at today's values. Walks backwards from today, undoing
// each day: add back everyday spending and last month's bills (all treated as monthly), and take out
// paychecks (every 14 days before the next one), sized so a month's income covers bills plus spending.
// Each day's left-over sets aside that day's bills due before its next payday, spending until then, and the cushion.
export function mockHistory(p: Persona, today: Date, balance: number, days = 30): SafeToSaveHistoryPoint[] {
  const rand = seededRandom(p.id);
  const dailySpend = p.projectedSpending / Math.max(1, p.paydayInDays);
  const monthlyBills = p.bills.reduce((sum, bill) => sum + bill.amount, 0);
  const paycheck = ((monthlyBills + dailySpend * 30) * 14) / 30;
  const points: SafeToSaveHistoryPoint[] = [];
  let b = balance;
  for (let i = 0; i < days; i++) {
    const day = addDays(today, -i);
    const daysToPayday = (p.paydayInDays + i) % 14 || 14;
    const billsDue = p.bills.filter((bill) => (bill.dueInDays + i) % 30 <= daysToPayday).reduce((sum, bill) => sum + bill.amount, 0);
    const committed = billsDue + dailySpend * daysToPayday + p.safetyBuffer;
    points.push({ date: isoDate(day), balance: Math.round(b), amount: Math.max(0, Math.round(b - committed)) });
    const billsPaid = p.bills.filter((bill) => bill.dueInDays + i === 30).reduce((sum, bill) => sum + bill.amount, 0);
    const isPayday = (p.paydayInDays + i) % 14 === 0;
    b += dailySpend * (0.4 + rand() * 1.2) + billsPaid - (isPayday ? paycheck : 0);
  }
  return points.reverse();
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
  // Money "moved" from checking into goals this session, so the mock balance updates after contributions.
  let movedToGoals = new Map<PersonaId, number>();

  function initialState(): Map<PersonaId, PersonaState> {
    const createdAt = now().toISOString();
    return new Map(
      PERSONAS.map((p) => [
        p.id,
        {
          score: { ...p.score, userId: uidFor(p.id), level: levelFor(p.score.points) },
          coins: p.coins,
          challengesCompleted: p.challengesCompleted,
          history: mockChallengeHistory(p, now()),
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
        const balance = p.currentBalance - (movedToGoals.get(p.id) ?? 0);
        const committed = upcomingBillsTotal + p.projectedSpending + p.safetyBuffer;
        const amount = Math.max(0, balance - committed);
        const paydayText = payday.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });

        return {
          amount,
          explanation: [
            `You have ${formatCents(balance)} in checking, and your next paycheck should land ${paydayText}.`,
            `${joinNames(p.bills.map((b) => b.merchant))} (${formatCents(upcomingBillsTotal)}) ${p.bills.length === 1 ? "is" : "are"} due before then, so we set that aside first.`,
            `Based on your usual spending, about ${formatCents(p.projectedSpending)} covers everything else until payday.`,
            p.insight,
            amount > 0
              ? `We keep a ${formatCents(p.safetyBuffer)} cushion, which leaves ${formatCents(amount)} you can safely move to your goal.`
              : `After a ${formatCents(p.safetyBuffer)} cushion there's nothing extra this time, and that's okay.`,
          ],
          explanationSource: "template",
          nextPayday: isoDate(payday),
          history: mockHistory(p, today, balance),
          breakdown: {
            currentBalance: balance,
            expectedIncome: 0,
            upcomingBillsTotal,
            upcomingBills,
            projectedSpending: p.projectedSpending,
            safetyBuffer: p.safetyBuffer,
          },
        };
      }),

    getChallenges: () => respond("getChallenges", () => ({ challenges: mine().active })),

    getMyScore: () => respond("getMyScore", () => mine().score),

    getGameState: () =>
      respond("getGameState", () => {
        const s = mine();
        const goalsCreated = [...goals.values()].filter((g) => g.goal.ownerId === uidFor(settings.persona)).length;
        return {
          xp: s.score.points,
          ...levelProgress(s.score.points),
          coins: s.coins,
          badges: evaluateBadges({ goalsCreated, streak: s.score.streak, challengesCompleted: s.challengesCompleted }),
        };
      }),

    getActivity: () =>
      respond("getActivity", (): Activity => {
        const s = mine();
        const myGoals = [...goals.values()].filter((g) => g.goal.ownerId === uidFor(settings.persona));
        return {
          completedChallenges: s.history,
          contributions: myGoals.flatMap(({ goal, entries }) =>
            entries.flatMap((e) => (e.kind === "contribution" ? [{ goalName: goal.name, amount: e.amount, createdAt: e.createdAt }] : [])),
          ),
          streak: s.score.streak,
        };
      }),

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
        s.coins += challenge.points; // coins are earned 1:1 with XP
        s.challengesCompleted += 1;
        s.history.push({ id: challenge.id, description: challenge.description, points: challenge.points, completedAt: challenge.completedAt! });

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
        movedToGoals.set(settings.persona, (movedToGoals.get(settings.persona) ?? 0) + amount);
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
      movedToGoals = new Map();
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
