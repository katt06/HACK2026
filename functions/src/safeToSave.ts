import { getFirestore } from "firebase-admin/firestore";
import { onCall } from "firebase-functions/v2/https";
import type { AccountDoc, GetSafeToSaveRequest, GetSafeToSaveResponse, TransactionDoc, UserDoc } from "./contract.js";
import { todayIso } from "./logic/dates.js";
import { forecastSafeToSave, noDataForecast } from "./logic/forecast.js";
import { backtest, remainingMoneyHistory } from "./logic/trackRecord.js";
import { requireAuth } from "./validate.js";

// Remaining money until payday, plus its weekly history and a backtest so users can judge it for themselves.
export const getSafeToSave = onCall<GetSafeToSaveRequest>(async (request): Promise<GetSafeToSaveResponse> => {
  const uid = requireAuth(request);
  const db = getFirestore();

  const user = (await db.doc(`users/${uid}`).get()).data() as UserDoc | undefined;
  const today = todayIso(new Date(), user?.settings?.timezone);

  // All of it: the forecast looks back 120 days, and the history and backtest up to six months more.
  const [accountSnap, txSnap] = await Promise.all([
    db.doc(`accounts/${uid}`).get(),
    db.collection("transactions").where("userId", "==", uid).get(),
  ]);
  const account = accountSnap.data() as AccountDoc | undefined;
  const transactions = txSnap.docs.map((d) => d.data() as TransactionDoc);

  if (!account && transactions.length === 0) {
    const { incomeIsIrregular: _, ...empty } = noDataForecast(today);
    return { ...empty, explanationSource: "template", history: [], trackRecord: null };
  }

  const currentBalance = account?.currentBalance ?? 0;
  const { incomeIsIrregular: _, ...forecast } = forecastSafeToSave({ today, currentBalance, transactions });
  const history = { today, currentBalance, balanceAsOf: account?.asOf ?? today, transactions };
  return {
    ...forecast,
    explanationSource: "template",
    history: remainingMoneyHistory(history),
    trackRecord: backtest(history),
  };
});
