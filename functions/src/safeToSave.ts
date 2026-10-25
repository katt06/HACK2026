import { getFirestore } from "firebase-admin/firestore";
import { onCall } from "firebase-functions/v2/https";
import type { AccountDoc, GetSafeToSaveRequest, GetSafeToSaveResponse, TransactionDoc, UserDoc } from "./contract.js";
import { addDays, todayIso } from "./logic/dates.js";
import { forecastSafeToSave, noDataForecast } from "./logic/forecast.js";
import { FORECAST_HISTORY_DAYS, safeToSaveHistory } from "./logic/safeToSaveHistory.js";
import { backtest } from "./logic/trackRecord.js";
import { requireAuth } from "./validate.js";

// Each day of the 30-day track record needs its own 120-day forecast window (enough for monthly bills to
// show up 3+ times, plus the 90-day irregular-income lookback).
const TRACK_RECORD_DAYS = 30;

export const getSafeToSave = onCall<GetSafeToSaveRequest>(async (request): Promise<GetSafeToSaveResponse> => {
  const uid = requireAuth(request);
  const db = getFirestore();

  const user = (await db.doc(`users/${uid}`).get()).data() as UserDoc | undefined;
  const today = todayIso(new Date(), user?.settings?.timezone);

  // All of it: the 30-day history needs 150 days, and the payday backtest looks back up to six months.
  const [accountSnap, txSnap] = await Promise.all([
    db.doc(`accounts/${uid}`).get(),
    db.collection("transactions").where("userId", "==", uid).get(),
  ]);
  const account = accountSnap.data() as AccountDoc | undefined;
  const transactions = txSnap.docs.map((d) => d.data() as TransactionDoc);

  const { incomeIsIrregular: _, ...forecast } =
    account || transactions.length > 0
      ? forecastSafeToSave({
          today,
          currentBalance: account?.currentBalance ?? 0,
          transactions: transactions.filter((t) => t.date >= addDays(today, -FORECAST_HISTORY_DAYS)),
        })
      : noDataForecast(today);
  // Past balances are rebuilt from the account's balance, so there's no track record without one.
  if (!account) return { ...forecast, explanationSource: "template" };
  const input = { today, currentBalance: account.currentBalance, balanceAsOf: account.asOf, transactions };
  return {
    ...forecast,
    explanationSource: "template",
    history: safeToSaveHistory(input, TRACK_RECORD_DAYS),
    trackRecord: backtest(input),
  };
});
