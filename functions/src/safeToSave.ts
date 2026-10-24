import { getFirestore } from "firebase-admin/firestore";
import { onCall } from "firebase-functions/v2/https";
import type { AccountDoc, GetSafeToSaveRequest, GetSafeToSaveResponse, TransactionDoc, UserDoc } from "./contract.js";
import { addDays, todayIso } from "./logic/dates.js";
import { forecastSafeToSave, noDataForecast } from "./logic/forecast.js";
import { requireAuth } from "./validate.js";

// Enough for monthly bills to show up 3+ times, plus the 90-day irregular-income lookback.
const HISTORY_DAYS = 120;

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
      ? forecastSafeToSave({ today, currentBalance: account?.currentBalance ?? 0, transactions })
      : noDataForecast(today);
  return { ...forecast, explanationSource: "template" };
});
