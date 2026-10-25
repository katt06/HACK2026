// Demo helper: a paycheck lands today for one user, then their payday auto-saves run.
// Emulator data never receives real paychecks, so this stands in for one arriving (via Plaid, later).
// Usage: npm run payday -- demo-hero      (emulators must be running; never point this at production)
process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";

import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { runAutoSavesForUser } from "../functions/src/autoSaveStore.js";
import type { AccountDoc, TransactionDoc, UserDoc } from "../functions/src/contract.js";
import { todayIso } from "../functions/src/logic/dates.js";
import { formatCents } from "../functions/src/logic/money.js";
import { detectRecurring } from "../functions/src/logic/recurring.js";

if (!/^(127\.0\.0\.1|localhost):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST!)) {
  console.error("Refusing to run: FIRESTORE_EMULATOR_HOST is not a local emulator.");
  process.exit(1);
}

initializeApp({ projectId: "demo-hack2026" });
const db = getFirestore();

async function main() {
  const uid = process.argv[2];
  if (!uid) throw new Error("Usage: npm run payday -- <uid>   (e.g. demo-hero)");
  const user = (await db.doc(`users/${uid}`).get()).data() as UserDoc | undefined;
  const account = (await db.doc(`accounts/${uid}`).get()).data() as AccountDoc | undefined;
  if (!user || !account) throw new Error(`No user/account for ${uid}. Did you run npm run seed?`);
  const today = todayIso(new Date(), user.settings?.timezone);

  // Use their usual paycheck if they have one; otherwise a typical gig payout.
  const transactions = (await db.collection("transactions").where("userId", "==", uid).get()).docs.map((d) => d.data() as TransactionDoc);
  const payday = detectRecurring(transactions, today).find((s) => s.isPayday);
  const paycheck: TransactionDoc = {
    userId: uid,
    amount: -(payday?.amount ?? 50000),
    category: "income",
    merchant: payday?.merchant ?? "UBER DRIVER PAYOUT",
    date: today,
    recurringId: null,
  };
  // Running it twice shouldn't pay them twice.
  if (transactions.some((t) => t.date === today && t.merchant === paycheck.merchant && t.amount < 0)) {
    console.log(`${user.displayName}: ${paycheck.merchant} already landed today; just running auto-saves.`);
  } else {
    await db.collection("transactions").add(paycheck);
    await db.doc(`accounts/${uid}`).set({ ...account, currentBalance: account.currentBalance - paycheck.amount, asOf: today });
    console.log(`${user.displayName}: ${paycheck.merchant} ${formatCents(-paycheck.amount)} landed on ${today}.`);
  }

  const plans = await runAutoSavesForUser(db, uid, today);
  if (plans.length === 0) console.log("No auto-saves ran (no goal has an auto-save rule, or they already ran today).");
  for (const p of plans) console.log(`  goal ${p.goalId}: ${p.reason}, moved ${formatCents(p.amount)} (rule asked for ${formatCents(p.wanted)}). ${p.note}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err.message ?? err);
    process.exit(1);
  });
