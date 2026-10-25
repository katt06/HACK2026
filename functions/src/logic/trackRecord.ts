// Why trust the remaining-money number? Backtest it: what would have happened if the user had moved the
// suggested amount on each recent payday. Each past amount only uses data available on that day.
// (The daily history chart is safeToSaveHistory in safeToSaveHistory.ts.)
import type { IsoDate, TrackRecord } from "../contract.js";
import { addDays, formatMonthDay } from "./dates.js";
import { formatCents } from "./money.js";
import { categorize, detectRecurring, seriesKey } from "./recurring.js";
import { balanceOn, safeToSaveOn, type BalanceHistoryInput } from "./safeToSaveHistory.js";

export const MAX_CHECKS = 12;
// Monthly bills only count as recurring after 3 charges, so the forecast can't know them before ~3 months
// of history. The backtest starts after that rather than blaming the forecast for a cold start.
const MIN_HISTORY_DAYS = 90;
const IRREGULAR_CHECK_DAYS = 14;

function earliestUsableDate(input: BalanceHistoryInput): IsoDate | null {
  if (input.transactions.length === 0) return null;
  const first = input.transactions.reduce((min, t) => (t.date < min ? t.date : min), input.transactions[0].date);
  return addDays(first, MIN_HISTORY_DAYS);
}

// Past paydays (when a recurring paycheck landed), or every two weeks for irregular income.
export function checkpoints(input: BalanceHistoryInput): { dates: IsoDate[]; paydays: boolean } {
  const earliest = earliestUsableDate(input);
  if (!earliest) return { dates: [], paydays: false };
  const paydayKeys = new Set(
    detectRecurring(input.transactions, input.today)
      .filter((s) => s.isPayday)
      .map((s) => s.key),
  );
  let dates: IsoDate[];
  if (paydayKeys.size > 0) {
    dates = [...new Set(input.transactions.filter((t) => t.amount < 0 && paydayKeys.has(seriesKey(t))).map((t) => t.date))];
  } else {
    dates = [];
    for (let d = addDays(input.today, -IRREGULAR_CHECK_DAYS); d >= earliest; d = addDays(d, -IRREGULAR_CHECK_DAYS)) dates.push(d);
  }
  dates = dates.filter((d) => d >= earliest && d < input.today).sort();
  return { dates: dates.slice(-MAX_CHECKS), paydays: paydayKeys.size > 0 };
}

// For each checkpoint: move that day's remaining money out, then track the balance until the next checkpoint.
// The suggested move replaces the transfers to savings the user actually made in that window (both are
// "money to the goal"), so those are added back; otherwise the same savings would leave checking twice.
export function backtest(input: BalanceHistoryInput): TrackRecord | null {
  const { dates, paydays } = checkpoints(input);
  if (dates.length === 0) return null;
  const transfers = input.transactions.filter((t) => t.amount > 0 && categorize(t.merchant) === "transfer");
  let stayedPositive = 0;
  let lowestBalance = Infinity;
  dates.forEach((date, i) => {
    const moved = safeToSaveOn(date, input);
    const end = dates[i + 1] ?? addDays(input.today, 1);
    let lowest = Infinity;
    for (let d = date; d < end && d <= input.today; d = addDays(d, 1)) {
      const actuallyMoved = transfers.filter((t) => t.date > date && t.date <= d).reduce((s, t) => s + t.amount, 0);
      lowest = Math.min(lowest, balanceOn(d, input) + actuallyMoved - moved);
    }
    if (lowest >= 0) stayedPositive++;
    lowestBalance = Math.min(lowestBalance, lowest);
  });

  const when = paydays ? "paydays" : "two-week check-ins";
  const result =
    stayedPositive === dates.length
      ? `would have kept you above $0 every time (your lowest balance would have been ${formatCents(lowestBalance)})`
      : `would have kept you above $0 ${stayedPositive} of ${dates.length} times`;
  return {
    checks: dates.length,
    stayedPositive,
    lowestBalance,
    since: dates[0],
    summary: `Since ${formatMonthDay(dates[0])}, moving the suggested amount on each of your last ${dates.length} ${when} ${result}.`,
  };
}
