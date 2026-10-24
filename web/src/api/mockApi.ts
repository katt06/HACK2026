// In-memory mock of the callables. State resets on page reload.
import { FirebaseError } from "firebase/app";
import type {
  ChallengeDoc,
  CompleteChallengeResponse,
  GetLeaderboardResponse,
  GetSafeToSaveResponse,
  GroupDoc,
  GroupSummary,
  IsoDate,
  MAX_GROUP_MEMBERS,
  ScoreDoc,
  WithId,
} from "@contract";
import { formatCents } from "../lib/format";
import { generateInviteCode, normalizeInviteCode } from "../lib/inviteCode";
import { DEFAULT_PERSONA, MOCK_GROUPS, PERSONAS, type ChallengeSeed, type Persona, type PersonaId } from "./mockData";
import type { Api, ApiMethod } from "./types";

const MAX_MEMBERS: typeof MAX_GROUP_MEMBERS = 20;

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
}

interface PersonaState {
  score: ScoreDoc;
  active: WithId<ChallengeDoc>[];
  nextSeed: number; // index into persona.challenges of the next refill
  lastCompletedOn: IsoDate | null;
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

  function initialState(): Map<PersonaId, PersonaState> {
    const createdAt = now().toISOString();
    return new Map(
      PERSONAS.map((p) => [
        p.id,
        {
          score: { ...p.score, userId: uidFor(p.id), level: levelFor(p.score.points) },
          active: [0, 1, 2].map((i) => challengeFrom(p, i, createdAt)),
          nextSeed: 3,
          lastCompletedOn: null,
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

  function groupSummary(id: string): GroupSummary {
    const g = groups.get(id)!;
    return {
      id,
      name: g.name,
      inviteCode: g.inviteCode,
      members: g.members.map((userId) => ({
        userId,
        displayName: g.memberNames[userId] ?? "Member",
        isMe: userId === uidFor(settings.persona),
      })),
    };
  }

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
              ? `We keep a ${formatCents(p.safetyBuffer)} cushion, which leaves ${formatCents(amount)} you can safely move to your goal.`
              : `After a ${formatCents(p.safetyBuffer)} cushion there's nothing extra this time, and that's okay.`,
          ],
          explanationSource: "template",
          nextPayday: isoDate(payday),
          breakdown: {
            currentBalance: p.currentBalance,
            upcomingBillsTotal,
            upcomingBills,
            projectedSpending: p.projectedSpending,
            safetyBuffer: p.safetyBuffer,
          },
        };
      }),

    getChallenges: () => respond("getChallenges", () => ({ challenges: mine().active })),

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

        const levelBefore = s.score.level;
        const today = isoDate(timestamp);
        const points = s.score.points + challenge.points;
        s.score = {
          ...s.score,
          points,
          level: levelFor(points),
          streak: s.lastCompletedOn === today ? s.score.streak : s.score.streak + 1,
        };
        s.lastCompletedOn = today;

        // Replace the completed challenge with the next seed, if any are left.
        const p = persona();
        const refill = s.nextSeed < p.challenges.length ? [challengeFrom(p, s.nextSeed++, timestamp.toISOString())] : [];
        s.active = [...s.active.slice(0, index), ...refill, ...s.active.slice(index + 1)];

        return { challenge, pointsAwarded: challenge.points, score: s.score, leveledUp: s.score.level > levelBefore };
      }),

    getLeaderboard: (groupId) =>
      respond("getLeaderboard", (): GetLeaderboardResponse => {
        const group = groups.get(groupId) ?? groups.get(MOCK_GROUPS[0].id)!;
        const rows = PERSONAS.filter((p) => group.members.includes(uidFor(p.id))).map((p) => ({ ...state.get(p.id)!.score, displayName: p.displayName, isMe: p.id === settings.persona }));
        rows.sort((a, b) => b.points - a.points);
        return {
          group: { id: groupId, name: group.name, inviteCode: group.inviteCode },
          entries: rows.map((row, i) => ({ ...row, rank: i + 1 })),
        };
      }),

    getMyGroups: () =>
      respond("getMyGroups", () => {
        const me = uidFor(settings.persona);
        return [...groups.keys()].filter((id) => groups.get(id)!.members.includes(me)).map(groupSummary);
      }),

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
          if (group.members.length >= MAX_MEMBERS) throw new FirebaseError("functions/failed-precondition", "This group is full.");
          group.members.push(me);
          group.memberNames[me] = persona().displayName;
        }
        return { group: groupSummary(id), alreadyMember };
      }),
  };

  const changed = () => options.onSettingsChange?.({ ...settings, failOnly: [...settings.failOnly] });

  const controls: MockControls = {
    persona(id) {
      if (id) {
        if (!PERSONAS.some((p) => p.id === id)) throw new Error(`Unknown persona "${id}"`);
        settings.persona = id;
        changed();
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
    },
    status() {
      return { ...settings, personas: PERSONAS.map((p) => p.id) };
    },
  };

  return { api, controls };
}
