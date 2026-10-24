// Past safe-to-save amounts, rebuilt from today's balance and the transaction history (nothing is logged).
import type { Cents, IsoDate } from "../contract.js";
import { addDays } from "./dates.js";
import { forecastSafeToSave } from "./forecast.js";
import type { TransactionLike } from "./recurring.js";

const FORECAST_HISTORY_DAYS = 120; // same window the getSafeToSave callable loads

export interface BalanceHistoryInput {
  today: IsoDate;
  currentBalance: Cents;
  balanceAsOf: IsoDate; // the date currentBalance was measured
  transactions: TransactionLike[];
}

// End-of-day balance on `date`: undo every transaction after it (adding back money out, removing money in).
export function balanceOn(date: IsoDate, { currentBalance, balanceAsOf, transactions }: BalanceHistoryInput): Cents {
  return transactions.filter((t) => t.date > date && t.date <= balanceAsOf).reduce((balance, t) => balance + t.amount, currentBalance);
}

export function safeToSaveOn(date: IsoDate, input: BalanceHistoryInput): Cents {
  const from = addDays(date, -FORECAST_HISTORY_DAYS);
  const transactions = input.transactions.filter((t) => t.date >= from && t.date <= date);
  return forecastSafeToSave({ today: date, currentBalance: balanceOn(date, input), transactions }).amount;
}

// For weeklyStreak: how many days in the week starting weekStart (up to today) had $0 safe to save.
export function zeroSafeToSaveDaysCounter(input: BalanceHistoryInput): (weekStart: IsoDate) => number {
  return (weekStart) => {
    let zeroDays = 0;
    for (let day = weekStart; day <= addDays(weekStart, 6) && day <= input.today; day = addDays(day, 1)) {
      if (safeToSaveOn(day, input) === 0) zeroDays++;
    }
    return zeroDays;
  };
}
