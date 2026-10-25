import type { Firestore, Transaction } from "firebase-admin/firestore";
import type { AccountDoc, Cents, IsoDate, TransactionDoc } from "./contract.js";

export const SAVINGS_TRANSFER_MERCHANT = "TRANSFER TO SAVINGS";

// Inside a Firestore transaction (after all reads): money leaves the tracked checking balance for savings.
// Lowers the balance and records a "transfer" transaction, which the forecast never counts as spending.
// The app can't move real money; this keeps its own balance and history consistent with what the user did.
export function debitForSavings(tx: Transaction, db: Firestore, uid: string, account: AccountDoc, amount: Cents, today: IsoDate): Cents {
  const newBalance = account.currentBalance - amount;
  const updated: AccountDoc = { ...account, currentBalance: newBalance, asOf: account.asOf > today ? account.asOf : today };
  tx.set(db.doc(`accounts/${uid}`), updated);
  const transfer: TransactionDoc = {
    userId: uid,
    amount,
    category: "transfer",
    merchant: SAVINGS_TRANSFER_MERCHANT,
    date: today,
    recurringId: null,
  };
  tx.set(db.collection("transactions").doc(), transfer);
  return newBalance;
}
