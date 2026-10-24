// Seeds the local Firestore + Auth emulators. Never point this at production.
process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= "127.0.0.1:9099";

import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

initializeApp({ projectId: "demo-hack2026" });
const auth = getAuth();
const db = getFirestore();

async function upsertUser(uid: string, email: string, displayName: string) {
  try {
    await auth.getUser(uid);
  } catch {
    await auth.createUser({ uid, email, password: "password", displayName });
  }
  await db.doc(`users/${uid}`).set({ displayName, baselineSpendByCategory: {}, settings: {} });
}

async function main() {
  await upsertUser("alice", "alice@example.com", "Alice");
  await upsertUser("bob", "bob@example.com", "Bob");
  // Alice's group, which Bob isn't in yet, so you can demo joining with SAVE24.
  await db.doc("groups/seed-alice-group").set({
    name: "Alice's Savings Crew",
    members: ["alice"],
    memberNames: { alice: "Alice" },
    inviteCode: "SAVE24",
  });
  console.log("Seeded users: alice@example.com, bob@example.com (password: password)");
  console.log("Seeded group: Alice's Savings Crew (invite code SAVE24)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
