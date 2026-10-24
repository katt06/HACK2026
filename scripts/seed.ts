// Clears and reseeds the local Firestore + Auth emulators. Never point this at production.
// Usage: npm run seed            (dates relative to today)
//        SEED_TODAY=2026-10-24 npm run seed   (pin the date for byte-identical reruns)
process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= "127.0.0.1:9099";

import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, type DocumentReference } from "firebase-admin/firestore";
import type { TransactionDoc } from "../functions/src/contract.js";
import { isIsoDate, todayIso } from "../functions/src/logic/dates.js";
import { assignRecurring } from "../functions/src/logic/recurring.js";
import { generateSeedData, PASSWORD } from "./seedData.js";

const PROJECT_ID = "demo-hack2026";
const FIRESTORE_HOST = process.env.FIRESTORE_EMULATOR_HOST;
const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST;

for (const host of [FIRESTORE_HOST, AUTH_HOST]) {
  if (!/^(127\.0\.0\.1|localhost):\d+$/.test(host)) {
    console.error(`Refusing to seed: ${host} is not a local emulator.`);
    process.exit(1);
  }
}

initializeApp({ projectId: PROJECT_ID });
const auth = getAuth();
const db = getFirestore();

async function clearEmulators() {
  const urls = [
    `http://${FIRESTORE_HOST}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`,
    `http://${AUTH_HOST}/emulator/v1/projects/${PROJECT_ID}/accounts`,
  ];
  for (const url of urls) {
    const res = await fetch(url, { method: "DELETE" }).catch(() => null);
    if (!res?.ok) throw new Error(`Couldn't clear ${url}. Are the emulators running? (npm run dev or firebase emulators:start)`);
  }
}

// Firestore batches cap at 500 writes.
async function writeAll(writes: [DocumentReference, object][]) {
  for (let i = 0; i < writes.length; i += 500) {
    const batch = db.batch();
    for (const [ref, data] of writes.slice(i, i + 500)) batch.set(ref, data);
    await batch.commit();
  }
}

async function main() {
  const today = process.env.SEED_TODAY ?? todayIso();
  if (!isIsoDate(today)) throw new Error(`SEED_TODAY must look like 2026-10-24, got ${today}`);

  const data = generateSeedData(today);
  await clearEmulators();

  const writes: [DocumentReference, object][] = [];
  for (const user of data.users) {
    await auth.createUser({ uid: user.uid, email: user.email, password: PASSWORD, displayName: user.displayName });

    writes.push([
      db.doc(`users/${user.uid}`),
      {
        displayName: user.displayName,
        baselineSpendByCategory: user.baselineSpendByCategory,
        settings: { notificationsEnabled: false, timezone: "America/New_York" },
      },
    ]);
    writes.push([db.doc(`accounts/${user.uid}`), user.account]);

    // Same detection the daily refreshRecurring job runs, so seeded data starts consistent.
    const transactions = user.transactions.map((t, i) => ({ ...t, id: `${user.uid}-${String(i).padStart(4, "0")}` }));
    const { recurring, recurringIdByTxId } = assignRecurring(user.uid, transactions, today);
    for (const { id, ...t } of transactions) {
      const doc: TransactionDoc = { userId: user.uid, ...t, recurringId: recurringIdByTxId[id] };
      writes.push([db.doc(`transactions/${id}`), doc]);
    }
    for (const { id, ...doc } of recurring) writes.push([db.doc(`recurring/${id}`), doc]);

    const goalRef = db.doc(`goals/${user.uid}-goal`);
    writes.push([goalRef, user.goal]);
    user.contributions.forEach((c, i) => writes.push([goalRef.collection("entries").doc(`c${String(i).padStart(2, "0")}`), c]));
  }
  for (const [id, group] of Object.entries(data.groups)) writes.push([db.doc(`groups/${id}`), group]);

  await writeAll(writes);

  console.log(`Seeded ${writes.length} docs as of ${today} (password for everyone: ${PASSWORD})`);
  console.table(
    data.users.map((u) => ({
      email: u.email,
      story: u.story,
      transactions: u.transactions.length,
      balance: `$${(u.account.currentBalance / 100).toFixed(2)}`,
      goal: `${u.goal.name} ${Math.round((100 * u.goal.currentAmount) / u.goal.targetAmount)}%`,
    })),
  );
  for (const [id, g] of Object.entries(data.groups)) console.log(`Group ${g.name} (${id}): invite code ${g.inviteCode}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
