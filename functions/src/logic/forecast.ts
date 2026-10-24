// "Safe to save": how much can move to a goal now without coming up short before the next payday.
// Pure function over a balance and transaction history; the callable just loads the data.
//
// safeToSave = currentBalance + expectedIncome − upcomingBills − projectedSpending − buffer, floored at 0
import type { Cents, GetSafeToSaveResponse, IsoDate, UpcomingBill } from "../contract.js";
import { addDays, daysBetween, formatDay } from "./dates.js";
import { formatCents } from "./money.js";
import { detectRecurring, nextOccurrence, seriesKey, type RecurringSeries, type TransactionLike } from "./recurring.js";
import { median, percentile } from "./stats.js";

export const VARIABLE_SPEND_WINDOW_DAYS = 60;
export const MIN_BUFFER: Cents = 5000;
export const BUFFER_SHARE_OF_BILLS = 0.1;
// Irregular income: plan two weeks at a time and only count a low-end share of likely payouts.
export const IRREGULAR_HORIZON_DAYS = 14;
export const IRREGULAR_LOOKBACK_DAYS = 90;
export const IRREGULAR_PAYOUT_PERCENTILE = 0.25;

export interface ForecastInput {
  today: IsoDate;
  currentBalance: Cents;
  transactions: TransactionLike[];
  recurring?: RecurringSeries[]; // defaults to detectRecurring(transactions, today)
}

export type Forecast = Omit<GetSafeToSaveResponse, "explanationSource"> & { incomeIsIrregular: boolean };

interface IncomePlan {
  nextPayday: IsoDate;
  expectedIncome: Cents;
  irregular: boolean;
}

function planIncome(today: IsoDate, transactions: TransactionLike[], series: RecurringSeries[]): IncomePlan {
  const paydays = series.filter((s) => s.isPayday).map((s) => s.nextDue);
  if (paydays.length > 0) {
    // The paycheck lands on payday itself, so nothing extra arrives before it.
    return { nextPayday: paydays.sort()[0], expectedIncome: 0, irregular: false };
  }

  const from = addDays(today, -(IRREGULAR_LOOKBACK_DAYS - 1));
  const inflows = transactions.filter((t) => t.amount < 0 && t.date >= from && t.date <= today);
  const dates = [...new Set(inflows.map((t) => t.date))].sort();
  const typicalGap = median(dates.slice(1).map((d, i) => daysBetween(dates[i], d)));
  const expectedPayouts = typicalGap > 0 ? Math.floor(IRREGULAR_HORIZON_DAYS / typicalGap) : 0;
  const lowPayout = percentile(
    inflows.map((t) => -t.amount),
    IRREGULAR_PAYOUT_PERCENTILE,
  );
  return {
    nextPayday: addDays(today, IRREGULAR_HORIZON_DAYS),
    expectedIncome: Math.round(expectedPayouts * lowPayout),
    irregular: true,
  };
}

// Every occurrence of each recurring bill from its next due date through payday (a weekly bill can land twice).
function billsThrough(series: RecurringSeries[], today: IsoDate, nextPayday: IsoDate): UpcomingBill[] {
  const bills: UpcomingBill[] = [];
  for (const s of series) {
    if (s.isPayday) continue;
    for (let due = s.nextDue; due <= nextPayday; due = nextOccurrence(due, s.cadence)) {
      if (due >= today) bills.push({ merchant: s.merchant, amount: s.amount, dueDate: due });
    }
  }
  return bills.sort((a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : a.merchant.localeCompare(b.merchant)));
}

// Average daily spend that isn't a recurring charge, over the last 60 days (or the whole history if shorter).
function averageDailyVariableSpend(today: IsoDate, transactions: TransactionLike[], series: RecurringSeries[]) {
  if (transactions.length === 0) return { perDay: 0, windowDays: 0 };
  const firstDate = transactions.reduce((earliest, t) => (t.date < earliest ? t.date : earliest), transactions[0].date);
  const windowDays = Math.max(1, Math.min(VARIABLE_SPEND_WINDOW_DAYS, daysBetween(firstDate, today) + 1));
  const from = addDays(today, -(windowDays - 1));
  const recurringKeys = new Set(series.map((s) => s.key));
  const total = transactions
    .filter((t) => t.amount > 0 && t.date >= from && t.date <= today && !recurringKeys.has(seriesKey(t)))
    .reduce((sum, t) => sum + t.amount, 0);
  return { perDay: total / windowDays, windowDays };
}

const ACRONYMS = new Set(["USA", "US", "LLC", "INC", "CVS", "ATM", "TV", "BP", "AT&T", "HBO", "AMC"]);

// "ELM STREET APARTMENTS" → "Elm Street Apartments", "SPOTIFY USA" → "Spotify USA"
export function displayMerchant(merchant: string): string {
  return merchant
    .split(/\s+/)
    .map((word) => (ACRONYMS.has(word.toUpperCase()) ? word.toUpperCase() : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()))
    .join(" ");
}

function listBills(bills: UpcomingBill[]): string {
  const names = [...new Set(bills.map((b) => displayMerchant(b.merchant)))];
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names[0]}, ${names[1]} and ${names.length - 2} more`;
}

export function forecastSafeToSave({ today, currentBalance, transactions, recurring }: ForecastInput): Forecast {
  const series = recurring ?? detectRecurring(transactions, today);
  const income = planIncome(today, transactions, series);
  const daysUntilPayday = Math.max(0, daysBetween(today, income.nextPayday));

  const upcomingBills = billsThrough(series, today, income.nextPayday);
  const upcomingBillsTotal = upcomingBills.reduce((sum, b) => sum + b.amount, 0);
  const variable = averageDailyVariableSpend(today, transactions, series);
  const projectedSpending = Math.round(variable.perDay * daysUntilPayday);
  const safetyBuffer = Math.max(MIN_BUFFER, Math.round(BUFFER_SHARE_OF_BILLS * upcomingBillsTotal));
  const amount = Math.max(0, currentBalance + income.expectedIncome - upcomingBillsTotal - projectedSpending - safetyBuffer);

  const when = formatDay(income.nextPayday);
  const explanation = [
    income.irregular
      ? `You have ${formatCents(currentBalance)} in checking. Your income varies, so we plan two weeks at a time (through ${when}) and ` +
        (income.expectedIncome > 0
          ? `only count ${formatCents(income.expectedIncome)} of likely payouts.`
          : `don't count on any payouts yet.`)
      : `You have ${formatCents(currentBalance)} in checking and get paid again on ${when}.`,
    upcomingBills.length > 0
      ? `${listBills(upcomingBills)} (${formatCents(upcomingBillsTotal)}) ${new Set(upcomingBills.map((b) => b.merchant)).size === 1 ? "is" : "are"} due before then, so we set that aside first.`
      : `No bills are due before then.`,
    `Based on your ${variable.windowDays >= VARIABLE_SPEND_WINDOW_DAYS ? "last two months" : "recent spending"}, about ${formatCents(projectedSpending)} covers everyday spending until then.`,
    amount > 0
      ? `We keep a ${formatCents(safetyBuffer)} cushion, which leaves ${formatCents(amount)} you can safely move to your goal.`
      : `After a ${formatCents(safetyBuffer)} cushion there's nothing extra this time, and that's okay.`,
  ];

  return {
    amount,
    nextPayday: income.nextPayday,
    explanation,
    incomeIsIrregular: income.irregular,
    breakdown: {
      currentBalance,
      expectedIncome: income.expectedIncome,
      upcomingBillsTotal,
      upcomingBills,
      projectedSpending,
      safetyBuffer,
    },
  };
}

// For a user with no account data yet: nothing to forecast, so say so instead of showing $0 as if it were advice.
export function noDataForecast(today: IsoDate): Forecast {
  return {
    amount: 0,
    nextPayday: addDays(today, IRREGULAR_HORIZON_DAYS),
    explanation: [
      "We don't have any account activity for you yet.",
      "Once your checking account is connected, we'll show how much is safe to move to your goal before each payday.",
    ],
    incomeIsIrregular: false,
    breakdown: { currentBalance: 0, expectedIncome: 0, upcomingBillsTotal: 0, upcomingBills: [], projectedSpending: 0, safetyBuffer: 0 },
  };
}
