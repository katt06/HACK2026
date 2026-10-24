// Merchant categorization and recurring-charge detection. Pure functions, no Firestore.
import type { Cadence, Category, Cents, IsoDate, RecurringDoc, TransactionDoc } from "../contract.js";
import { addDays, addMonths, daysBetween } from "./dates.js";
import { median } from "./stats.js";

export type TransactionLike = Pick<TransactionDoc, "merchant" | "amount" | "date">;

// ---------- Categorization ----------

// First match wins, so order matters: "uber eats" must hit delivery before "uber" hits transport,
// and payouts must hit income before their platform names hit anything else.
const RULES: [RegExp, Category][] = [
  [/payroll|direct dep|salary|payout|paycheck/, "income"],
  [/transfer to savings|online transfer|xfer|to savings/, "transfer"],
  [/doordash|uber eats|ubereats|grubhub|postmates|seamless|caviar|gopuff/, "delivery"],
  [/netflix|spotify|hulu|disney|hbo|apple\.com|icloud|youtube premium|audible|adobe|planet fitness|peloton|patreon|dropbox|paramount|crunchyroll|new york times|nytimes/, "subscriptions"],
  [/coffee|starbucks|dunkin|peet'?s|blue bottle|philz|tim hortons|espresso|caf[eé]\b/, "coffee"],
  [/trader joe|whole foods|safeway|kroger|aldi|costco|wegmans|publix|sprouts|grocery|supermarket|food lion/, "groceries"],
  [/apartment|\bapts?\b|residential|lofts?\b|property|realty|landlord|\brent\b/, "rent"],
  [/power|electric|energy|water|utility|gas co|verizon|t-mobile|at&t|spectrum|comcast|xfinity|internet/, "utilities"],
  [/insurance|geico|state farm|allstate|progressive|lemonade/, "insurance"],
  [/pharmacy|cvs|walgreens|clinic|medical|dental|hospital|rite aid/, "medical"],
  [/uber|lyft|shell|chevron|exxon|mobil|\bbp\b|arco|metro|transit|parking|clipper/, "transport"],
  [/airline|airbnb|hotel|marriott|hilton|expedia|delta air|united air|southwest/, "travel"],
  [/restaurant|grill|kitchen|pizza|burger|taco|sushi|thai|ramen|chipotle|mcdonald|sweetgreen|shake shack|panera|chick-fil-a|diner|bistro/, "dining"],
  [/amc|cinema|theat(er|re)|ticketmaster|steam|playstation|xbox|bowling/, "entertainment"],
  [/salon|barber|spa\b|sephora|ulta/, "personal_care"],
  [/amazon|amzn|target|walmart|best buy|etsy|ebay|ikea/, "shopping"],
];

// Money coming in is always income; otherwise match the merchant name.
export function categorize(merchant: string, amount?: Cents): Category {
  if (amount !== undefined && amount < 0) return "income";
  const name = merchant.toLowerCase();
  return RULES.find(([pattern]) => pattern.test(name))?.[1] ?? "other";
}

// "SQ *BLUE BOTTLE #12" → "blue bottle", "DOORDASH*CHIPOTLE" → "doordash", "STARBUCKS STORE 1123" → "starbucks"
export function normalizeMerchant(merchant: string): string {
  return merchant
    .toLowerCase()
    .replace(/^(sq|tst|sp|pp|py)\s*\*\s*/, "") // card-processor prefixes
    .split("*")[0] // platform*sub-merchant → platform
    .replace(/#\s*\d+/g, " ")
    .replace(/\bstore\s*\d+/g, " ")
    .replace(/\d{3,}/g, " ")
    .replace(/[^a-z0-9&]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

// ---------- Recurring detection ----------

const MIN_OCCURRENCES = 3;
const AMOUNT_TOLERANCE = 0.1; // every amount within 10% of the median
const GAP_TOLERANCE_DAYS = 3;
const CADENCES: [Cadence, number][] = [
  ["weekly", 7],
  ["biweekly", 14],
  ["monthly", 30],
];

export interface RecurringSeries {
  key: string; // normalized merchant + direction; transactions with this key belong to the series
  merchant: string; // most recent raw merchant name, for display
  amount: Cents; // median, always positive
  cadence: Cadence;
  nextDue: IsoDate;
  isPayday: boolean; // recurring inflow
  category: Category;
  occurrences: number;
  lastDate: IsoDate;
}

// Refunds and payments at the same merchant are different series.
export function seriesKey(t: Pick<TransactionLike, "merchant" | "amount">): string {
  return `${normalizeMerchant(t.merchant)}|${t.amount < 0 ? "in" : "out"}`;
}

export function nextOccurrence(date: IsoDate, cadence: Cadence): IsoDate {
  return cadence === "monthly" ? addMonths(date, 1) : addDays(date, cadence === "weekly" ? 7 : 14);
}

// Groups transactions by normalized merchant and keeps the groups that look like a schedule:
// 3+ occurrences, every amount within 10% of the median, and a median gap within 3 days of 7, 14 or 30.
// nextDue is projected from the last occurrence relative to asOf (default: the latest transaction date).
// Series that have missed more than a full cycle are treated as cancelled and dropped.
export function detectRecurring(transactions: TransactionLike[], asOf?: IsoDate): RecurringSeries[] {
  if (transactions.length === 0) return [];
  const today = asOf ?? transactions.reduce((latest, t) => (t.date > latest ? t.date : latest), transactions[0].date);

  const groups = new Map<string, TransactionLike[]>();
  for (const t of transactions) {
    if (t.amount === 0) continue;
    const key = seriesKey(t);
    groups.set(key, [...(groups.get(key) ?? []), t]);
  }

  const series: RecurringSeries[] = [];
  for (const [key, group] of groups) {
    if (group.length < MIN_OCCURRENCES) continue;
    const sorted = [...group].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

    const amounts = sorted.map((t) => Math.abs(t.amount));
    const typical = median(amounts);
    if (!amounts.every((a) => Math.abs(a - typical) <= AMOUNT_TOLERANCE * typical)) continue;

    const gaps = sorted.slice(1).map((t, i) => daysBetween(sorted[i].date, t.date));
    const typicalGap = median(gaps);
    const match = CADENCES.find(([, days]) => Math.abs(typicalGap - days) <= GAP_TOLERANCE_DAYS);
    if (!match) continue;
    const [cadence, periodDays] = match;

    const last = sorted[sorted.length - 1];
    let nextDue = nextOccurrence(last.date, cadence);
    const overdueDays = daysBetween(nextDue, today);
    if (overdueDays > periodDays) continue; // stopped
    if (overdueDays > GAP_TOLERANCE_DAYS) {
      while (nextDue < today) nextDue = nextOccurrence(nextDue, cadence); // skipped one; expect the next
    } else if (overdueDays > 0) {
      nextDue = today; // probably posting late; plan for it now
    }

    series.push({
      key,
      merchant: last.merchant,
      amount: Math.round(typical),
      cadence,
      nextDue,
      isPayday: last.amount < 0,
      category: categorize(last.merchant, last.amount),
      occurrences: sorted.length,
      lastDate: last.date,
    });
  }
  return series.sort((a, b) => (a.nextDue < b.nextDue ? -1 : a.nextDue > b.nextDue ? 1 : a.key.localeCompare(b.key)));
}

// Stable doc id per user and series, so reruns overwrite instead of duplicating.
export function recurringDocId(uid: string, key: string): string {
  const [name, direction] = key.split("|");
  return `${uid}_${name.replace(/[^a-z0-9]+/g, "-")}${direction === "in" ? "_in" : ""}`;
}

// Detects recurring series for one user and works out each transaction's recurringId.
export function assignRecurring<T extends TransactionLike & { id: string }>(uid: string, transactions: T[], asOf?: IsoDate) {
  const series = detectRecurring(transactions, asOf);
  const idByKey = new Map(series.map((s) => [s.key, recurringDocId(uid, s.key)]));
  const recurring = series.map((s) => {
    const doc: RecurringDoc = {
      userId: uid,
      merchant: s.merchant,
      amount: s.amount,
      cadence: s.cadence,
      nextDue: s.nextDue,
      category: s.category,
      isPayday: s.isPayday,
    };
    return { id: idByKey.get(s.key)!, ...doc };
  });
  const recurringIdByTxId: Record<string, string | null> = {};
  for (const t of transactions) recurringIdByTxId[t.id] = idByKey.get(seriesKey(t)) ?? null;
  return { recurring, recurringIdByTxId };
}
