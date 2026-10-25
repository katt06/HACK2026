import { getFirestore } from "firebase-admin/firestore";
import { onCall } from "firebase-functions/v2/https";
import type { AccountDoc, GetSafeToSaveRequest, GetSafeToSaveResponse, TransactionDoc, UserDoc } from "./contract.js";
import { addDays, todayIso } from "./logic/dates.js";
import { forecastSafeToSave, noDataForecast } from "./logic/forecast.js";
import { FORECAST_HISTORY_DAYS, safeToSaveHistory } from "./logic/safeToSaveHistory.js";
import { requireAuth } from "./validate.js";

// Each day of the 30-day track record needs its own 120-day forecast window (enough for monthly bills to
// show up 3+ times, plus the 90-day irregular-income lookback), so load 150 days.
const TRACK_RECORD_DAYS = 30;
const HISTORY_DAYS = FORECAST_HISTORY_DAYS + TRACK_RECORD_DAYS;

export const getSafeToSave = onCall<GetSafeToSaveRequest>(async (request): Promise<GetSafeToSaveResponse> => {
  const uid = requireAuth(request);
  const db = getFirestore();

  const user = (await db.doc(`users/${uid}`).get()).data() as UserDoc | undefined;
  const today = todayIso(new Date(), user?.settings?.timezone);

  const [accountSnap, txSnap] = await Promise.all([
    db.doc(`accounts/${uid}`).get(),
    db.collection("transactions").where("userId", "==", uid).where("date", ">=", addDays(today, -HISTORY_DAYS)).get(),
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
  const history = account
    ? safeToSaveHistory({ today, currentBalance: account.currentBalance, balanceAsOf: account.asOf, transactions }, TRACK_RECORD_DAYS)
    : undefined;
  return { ...forecast, explanationSource: "template", ...(history && { history }) };
});
