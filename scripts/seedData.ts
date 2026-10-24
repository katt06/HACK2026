// Deterministic demo data: 6 months of transactions for 5 personas, plus balances, goals and groups.
// Pure (no Firestore) so tests can import it. Same seed + same `today` → identical output.
import type {
  AccountDoc,
  Category,
  Cents,
  ContributionEntry,
  GoalDoc,
  GroupDoc,
  IsoDate,
} from "../functions/src/contract.js";
import { addDays, addMonths, dayOfWeek, daysBetween } from "../functions/src/logic/dates.js";
import { hashString, mulberry32, type Rng } from "../functions/src/logic/random.js";

export const SEED = 2026;
export const HISTORY_DAYS = 182; // ~6 months, ending today
export const PASSWORD = "password";

export const PERSONA_IDS = [
  "delivery-spender",
  "irregular-income",
  "subscription-creep",
  "steady-saver",
  "demo-hero",
] as const;
export type PersonaId = (typeof PERSONA_IDS)[number];

export interface SeedTransaction {
  date: IsoDate;
  merchant: string;
  category: Category;
  amount: Cents; // positive = money out, negative = money in
}

export interface SeedUser {
  uid: PersonaId;
  email: string;
  displayName: string;
  story: string;
  transactions: SeedTransaction[]; // oldest first
  account: AccountDoc;
  baselineSpendByCategory: Partial<Record<Category, Cents>>;
  goal: GoalDoc;
  contributions: ContributionEntry[]; // goals/{id}/entries, oldest first
}

export interface SeedData {
  today: IsoDate;
  users: SeedUser[];
  groups: Record<string, GroupDoc>; // id → group
}

// ---------- Ledger: a tiny DSL for writing persona histories ----------

class Ledger {
  readonly transactions: SeedTransaction[] = [];
  readonly start: IsoDate;

  constructor(
    readonly rng: Rng,
    readonly today: IsoDate,
  ) {
    this.start = addDays(today, -(HISTORY_DAYS - 1));
  }

  add(date: IsoDate, merchant: string, category: Category, amount: number) {
    if (date < this.start || date > this.today) return;
    this.transactions.push({ date, merchant, category, amount: Math.round(amount) });
  }

  between(min: number, max: number): number {
    return min + this.rng() * (max - min);
  }

  chance(p: number): boolean {
    return this.rng() < p;
  }

  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.rng() * items.length)];
  }

  // amount ± pct
  jitter(amount: number, pct: number): number {
    return amount * (1 + this.between(-pct, pct));
  }

  // Oldest day first. progress runs 0 → 1 across the history, for spending trends.
  everyDay(fn: (date: IsoDate, progress: number) => void) {
    for (let i = 0; i < HISTORY_DAYS; i++) fn(addDays(this.start, i), i / (HISTORY_DAYS - 1));
  }

  // Every 14 days, lined up so one lands on `anchor` (usually the next payday, in the future).
  everyTwoWeeks(anchor: IsoDate, fn: (date: IsoDate) => void) {
    let date = anchor;
    while (date > this.start) date = addDays(date, -14);
    for (; date <= this.today; date = addDays(date, 14)) if (date >= this.start) fn(date);
  }

  // Once a month on `day` (clamped to short months), from `from` onward.
  monthly(day: number, fn: (date: IsoDate) => void, from: IsoDate = this.start) {
    for (let first = `${from.slice(0, 8)}01`; first <= this.today; first = addMonths(first, 1)) {
      const lastDay = Number(addDays(addMonths(first, 1), -1).slice(8));
      const date = `${first.slice(0, 8)}${String(Math.min(day, lastDay)).padStart(2, "0")}`;
      if (date >= from) fn(date);
    }
  }

  // A recurring monthly charge. Utility-style bills vary ±5% and can post a couple of days late;
  // rent and subscriptions are fixed prices, like in real life.
  bill(merchant: string, category: Category, amount: Cents, day: number, opts: { variable?: boolean; from?: IsoDate } = {}) {
    this.monthly(
      day,
      (date) => {
        const posted = opts.variable ? addDays(date, Math.floor(this.between(0, 3))) : date;
        this.add(posted, merchant, category, opts.variable ? this.jitter(amount, 0.05) : amount);
      },
      opts.from,
    );
  }

  biweeklyPay(merchant: string, amount: Cents, nextPayday: IsoDate) {
    this.everyTwoWeeks(nextPayday, (date) => this.add(date, merchant, "income", -this.jitter(amount, 0.02)));
  }

  groceries(tripsPerWeek: number, min: Cents, max: Cents) {
    this.everyDay((date) => {
      if (this.chance(tripsPerWeek / 7)) {
        this.add(date, this.pick(["TRADER JOE'S #552", "SAFEWAY #1290", "WHOLE FOODS MKT"]), "groceries", this.between(min, max));
      }
    });
  }
}

function dayOfMonth(date: IsoDate): number {
  return Math.min(28, Number(date.slice(8)));
}

// ---------- Personas ----------

interface PersonaSpec {
  email: string;
  displayName: string;
  story: string;
  currentBalance: Cents;
  goal: { name: string; weekly: Cents; streak: number; olderChance: number; progressPct: number };
  history(l: Ledger): void;
}

const PERSONAS: Record<PersonaId, PersonaSpec> = {
  // 1. Stable biweekly salary; food delivery spikes on weekends and is creeping up.
  "delivery-spender": {
    email: "jordan@example.com",
    displayName: "Jordan",
    story: "Delivery spender",
    currentBalance: 185000,
    goal: { name: "Emergency fund", weekly: 2500, streak: 2, olderChance: 0.4, progressPct: 31 },
    history(l) {
      l.biweeklyPay("ACME CORP PAYROLL", 210000, addDays(l.today, 7));
      l.bill("MAPLE COURT APARTMENTS", "rent", 110000, 1);
      l.bill("CITY POWER & LIGHT", "utilities", 9000, 12, { variable: true });
      l.bill("VERIZON WIRELESS", "utilities", 6500, 22, { variable: true });
      l.bill("SPOTIFY USA", "subscriptions", 1099, 9);
      l.groceries(1.5, 2500, 7000);
      l.everyDay((date, progress) => {
        const weekend = [0, 5, 6].includes(dayOfWeek(date)); // Fri–Sun
        if (l.chance(weekend ? 0.55 + 0.25 * progress : 0.1)) {
          const merchant = l.pick(["DOORDASH*CHIPOTLE", "DOORDASH*THAI BASIL", "UBER EATS", "GRUBHUB*SUSHI ZONE"]);
          l.add(date, merchant, "delivery", l.between(2200, 4800));
        }
        if (l.chance(0.1)) l.add(date, "SHELL OIL 0457", "transport", l.between(3000, 5500));
      });
    },
  },

  // 2. Gig work: payouts of varying size at irregular intervals from two platforms.
  "irregular-income": {
    email: "riley@example.com",
    displayName: "Riley",
    story: "Irregular income",
    currentBalance: 230000,
    goal: { name: "New laptop", weekly: 3000, streak: 5, olderChance: 0.5, progressPct: 48 },
    history(l) {
      for (let d = addDays(l.start, Math.floor(l.between(0, 4))); d <= l.today; d = addDays(d, 3 + Math.floor(l.between(0, 6)))) {
        l.add(d, "UBER DRIVER PAYOUT", "income", -l.between(8000, 35000));
      }
      for (let d = addDays(l.start, Math.floor(l.between(0, 10))); d <= l.today; d = addDays(d, 10 + Math.floor(l.between(0, 16)))) {
        l.add(d, "UPWORK ESCROW PAYOUT", "income", -l.between(30000, 120000));
      }
      l.bill("OAKWOOD RESIDENTIAL", "rent", 95000, 3);
      l.bill("METRO WATER & POWER", "utilities", 7000, 15, { variable: true });
      l.bill("T-MOBILE", "utilities", 5500, 20, { variable: true });
      l.bill("NETFLIX.COM", "subscriptions", 1549, 14);
      l.groceries(2, 2500, 7500);
      l.everyDay((date) => {
        if (l.chance(0.12)) l.add(date, l.pick(["TACO LOCO", "SWEETGREEN"]), "dining", l.between(1500, 4000));
        if (l.chance(0.2)) l.add(date, "STARBUCKS STORE 1123", "coffee", l.between(450, 700));
        if (l.chance(0.15)) l.add(date, "CHEVRON 0091", "transport", l.between(3500, 6000));
      });
    },
  },

  // 3. Monthly salary; 8 subscriptions that piled up over the last few months, two of them unused
  //    (Planet Fitness and Audible: nothing in the history shows them being used).
  "subscription-creep": {
    email: "sam@example.com",
    displayName: "Sam",
    story: "Subscription creep",
    currentBalance: 148000,
    goal: { name: "Concert trip", weekly: 1500, streak: 1, olderChance: 0.35, progressPct: 22 },
    history(l) {
      l.monthly(28, (date) => l.add(date, "NORTHWIND PAYROLL", "income", -l.jitter(380000, 0.02)));
      l.bill("RIVERSIDE APARTMENTS", "rent", 125000, 1);
      l.bill("CITY POWER & LIGHT", "utilities", 7500, 10, { variable: true });
      l.bill("SPECTRUM INTERNET", "utilities", 6999, 18, { variable: true });
      const subscriptions: [string, Cents, number, number][] = [
        // merchant, price, day of month, months ago it started
        ["NETFLIX.COM", 1549, 5, 7],
        ["SPOTIFY USA", 1099, 9, 7],
        ["PLANET FITNESS", 2499, 20, 7], // unused
        ["APPLE.COM/BILL", 299, 25, 7],
        ["HULU", 799, 12, 5],
        ["DISNEY PLUS", 1399, 15, 5],
        ["ADOBE *CREATIVE CLOUD", 5499, 17, 4],
        ["AUDIBLE", 1495, 23, 4], // unused
      ];
      for (const [merchant, price, day, monthsAgo] of subscriptions) {
        l.bill(merchant, "subscriptions", price, day, { from: addMonths(l.today, -monthsAgo) });
      }
      l.groceries(2, 2000, 6500);
      l.everyDay((date) => {
        if (l.chance(0.1)) l.add(date, l.pick(["SHAKE SHACK", "PANERA BREAD"]), "dining", l.between(1200, 3500));
        if (l.chance(0.08)) l.add(date, "AMAZON MKTPLACE", "shopping", l.between(1500, 6000));
      });
    },
  },

  // 4. Consistent paycheck, steady weekly contributions, dining out trending down.
  "steady-saver": {
    email: "priya@example.com",
    displayName: "Priya",
    story: "Steady saver",
    currentBalance: 340000,
    goal: { name: "House down payment", weekly: 7500, streak: 12, olderChance: 0.9, progressPct: 74 },
    history(l) {
      l.biweeklyPay("GLOBEX PAYROLL", 260000, addDays(l.today, 3));
      l.bill("PARKVIEW LOFTS", "rent", 140000, 1);
      l.bill("CITY POWER & LIGHT", "utilities", 8500, 12, { variable: true });
      l.bill("VERIZON WIRELESS", "utilities", 7000, 22, { variable: true });
      l.bill("STATE FARM INSURANCE", "insurance", 11000, 7, { variable: true });
      l.bill("SPOTIFY USA", "subscriptions", 1099, 9);
      l.groceries(2, 3000, 8000);
      l.everyDay((date, progress) => {
        if (l.chance(0.3 - 0.22 * progress)) l.add(date, l.pick(["THAI BASIL KITCHEN", "SWEETGREEN"]), "dining", l.between(1800, 4500));
        if (l.chance(0.1)) l.add(date, "PEET'S COFFEE", "coffee", l.between(400, 650));
      });
    },
  },

  // 5. The account we log into on stage. Rent and Spotify land just before the next payday,
  //    delivery is trending down (a win to celebrate), coffee is trending up (today's challenge).
  "demo-hero": {
    email: "alex@example.com",
    displayName: "Alex",
    story: "Demo hero",
    currentBalance: 124000,
    goal: { name: "Spring break trip", weekly: 4000, streak: 4, olderChance: 0.6, progressPct: 42 },
    history(l) {
      l.biweeklyPay("INITECH PAYROLL", 190000, addDays(l.today, 6));
      l.bill("ELM STREET APARTMENTS", "rent", 90000, dayOfMonth(addDays(l.today, 4)));
      l.bill("SPOTIFY USA", "subscriptions", 1099, dayOfMonth(addDays(l.today, 5)));
      l.bill("CITY POWER & LIGHT", "utilities", 8000, 14, { variable: true });
      l.bill("VERIZON WIRELESS", "utilities", 6000, 21, { variable: true });
      l.groceries(1.5, 2500, 7000);
      l.everyDay((date, progress) => {
        const weekday = ![0, 6].includes(dayOfWeek(date));
        if (weekday && l.chance(0.3 + 0.3 * progress)) {
          l.add(date, l.pick(["BLUE BOTTLE COFFEE", "STARBUCKS STORE 0448"]), "coffee", l.between(450, 750));
        }
        if (l.chance(0.25 - 0.2 * progress)) l.add(date, l.pick(["DOORDASH*CHIPOTLE", "UBER EATS"]), "delivery", l.between(2200, 4500));
        if (l.chance(0.06)) l.add(date, "TACO LOCO", "dining", l.between(1500, 3500));
      });
    },
  },
};

// ---------- Derived data ----------

// Weekly contributions going back 26 weeks: an unbroken run of `streak` recent weeks, a missed week,
// then a random history. The deadline leaves the weekly amount ~25% above the pace needed, so every
// on-schedule week counts toward the streak.
function buildGoal(uid: PersonaId, spec: PersonaSpec["goal"], rng: Rng, today: IsoDate) {
  const contributions: ContributionEntry[] = [];
  for (let week = 25; week >= 0; week--) {
    const contributed = week < spec.streak || (week > spec.streak && rng() < spec.olderChance);
    if (contributed) {
      const createdAt = `${addDays(today, -(7 * week + 1))}T17:00:00.000Z`;
      contributions.push({ kind: "contribution", amount: spec.weekly, verified: false, note: "Weekly transfer", createdAt });
    }
  }
  const currentAmount = contributions.reduce((total, c) => total + c.amount, 0);
  const targetAmount = Math.round((currentAmount * 100) / spec.progressPct / 1000) * 1000; // round to $10
  const weeksLeft = Math.ceil((targetAmount - currentAmount) / (spec.weekly * 0.8));
  const goal: GoalDoc = {
    ownerId: uid,
    name: spec.name,
    targetAmount,
    currentAmount,
    deadline: addDays(today, 7 * weeksLeft),
    verified: false,
    sizingRecommendation: null,
    pausedUntil: null,
    createdAt: `${addDays(today, -(7 * 26))}T15:00:00.000Z`,
  };
  return { goal, contributions };
}

// Typical monthly spend per category, from the oldest 3 months so recent changes show up against it.
export function baselineFromHistory(transactions: SeedTransaction[], start: IsoDate): Partial<Record<Category, Cents>> {
  const windowDays = 91;
  const totals: Partial<Record<Category, Cents>> = {};
  for (const t of transactions) {
    if (t.amount <= 0 || daysBetween(start, t.date) >= windowDays) continue;
    totals[t.category] = (totals[t.category] ?? 0) + t.amount;
  }
  for (const category of Object.keys(totals) as Category[]) {
    totals[category] = Math.round((totals[category]! * 30) / windowDays);
  }
  return totals;
}

export function generateSeedUser(uid: PersonaId, today: IsoDate, seed = SEED): SeedUser {
  const spec = PERSONAS[uid];
  // Each persona gets its own stream, so changing one persona never reshuffles the others.
  const rng = mulberry32(seed ^ hashString(uid));
  const ledger = new Ledger(rng, today);
  spec.history(ledger);
  const transactions = ledger.transactions.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return {
    uid,
    email: spec.email,
    displayName: spec.displayName,
    story: spec.story,
    transactions,
    account: { userId: uid, currentBalance: spec.currentBalance, asOf: today },
    baselineSpendByCategory: baselineFromHistory(transactions, ledger.start),
    ...buildGoal(uid, spec.goal, rng, today),
  };
}

export function generateSeedData(today: IsoDate, seed = SEED): SeedData {
  const users = PERSONA_IDS.map((uid) => generateSeedUser(uid, today, seed));
  const names = Object.fromEntries(users.map((u) => [u.uid, u.displayName]));
  const groupOf = (name: string, inviteCode: string, members: PersonaId[]): GroupDoc => ({
    name,
    members,
    memberNames: Object.fromEntries(members.map((m) => [m, names[m]])),
    inviteCode,
  });
  return {
    today,
    users,
    groups: {
      // The Leaderboard page loads "demo-group".
      "demo-group": groupOf("Demo Squad", "SQUAD7", [...PERSONA_IDS]),
      // Alex isn't a member, so joining with HUSTLE can be demoed.
      "side-hustle": groupOf("Side Hustle Crew", "HUSTLE", ["irregular-income", "steady-saver"]),
    },
  };
}
