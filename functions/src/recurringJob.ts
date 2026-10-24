import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { logger } from "firebase-functions";
import { onSchedule } from "firebase-functions/v2/scheduler";
import type { TransactionDoc } from "./contract.js";
import { todayIso } from "./logic/dates.js";
import { assignRecurring } from "./logic/recurring.js";

// Re-detects one user's recurring series: rewrites recurring/*, removes series that stopped,
// and points each transaction's recurringId at its series (or null). Returns the series count.
export async function refreshRecurringForUser(db: Firestore, uid: string, asOf = todayIso()): Promise<number> {
  const [txSnap, existingSnap] = await Promise.all([
    db.collection("transactions").where("userId", "==", uid).get(),
    db.collection("recurring").where("userId", "==", uid).get(),
  ]);
  const transactions = txSnap.docs.map((d) => ({ id: d.id, ...(d.data() as TransactionDoc) }));
  const { recurring, recurringIdByTxId } = assignRecurring(uid, transactions, asOf);

  const writer = db.bulkWriter();
  const keep = new Set(recurring.map((r) => r.id));
  for (const doc of existingSnap.docs) if (!keep.has(doc.id)) void writer.delete(doc.ref);
  for (const { id, ...doc } of recurring) void writer.set(db.doc(`recurring/${id}`), doc);
  for (const t of transactions) {
    if (t.recurringId !== recurringIdByTxId[t.id]) void writer.update(db.doc(`transactions/${t.id}`), { recurringId: recurringIdByTxId[t.id] });
  }
  await writer.close();
  return recurring.length;
}

export const refreshRecurring = onSchedule("every day 04:00", async () => {
  const db = getFirestore();
  const users = await db.collection("users").select().get();
  for (const user of users.docs) {
    try {
      await refreshRecurringForUser(db, user.id);
    } catch (err) {
      logger.error("Recurring refresh failed", { uid: user.id, err });
    }
  }
});
