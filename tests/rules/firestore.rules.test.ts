// Security rules tests. Run with `npm run test:rules` (starts the Firestore emulator for you).
import { readFileSync } from "node:fs";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, setLogLevel, updateDoc, where } from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

let env: RulesTestEnvironment;

// Alice and Bob share a group; Carol is in no group with them.
const db = (uid: "alice" | "bob" | "carol") => env.authenticatedContext(uid).firestore();
const anon = () => env.unauthenticatedContext().firestore();

const goal = (ownerId: string) => ({
  ownerId,
  name: "Trip",
  targetAmount: 100000,
  currentAmount: 0,
  deadline: "2027-03-01",
  verified: false,
  sizingRecommendation: null,
  pausedUntil: null,
  createdAt: "2026-10-24T12:00:00.000Z",
});

beforeAll(async () => {
  setLogLevel("silent"); // the SDK logs every expected PERMISSION_DENIED
  env = await initializeTestEnvironment({
    projectId: "demo-hack2026-rules",
    firestore: { rules: readFileSync("firestore.rules", "utf8") },
  });
});

afterAll(async () => {
  await env.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const admin = ctx.firestore();
    await setDoc(doc(admin, "groups/g1"), { name: "Roomies", members: ["alice", "bob"], memberNames: { alice: "Alice", bob: "Bob" }, inviteCode: "SAVE24" });
    await setDoc(doc(admin, "scoreViewers/alice"), { uids: ["bob"] });
    await setDoc(doc(admin, "scoreViewers/bob"), { uids: ["alice"] });
    await setDoc(doc(admin, "users/alice"), { displayName: "Alice", baselineSpendByCategory: { dining: 20000 }, settings: { notificationsEnabled: false, timezone: "UTC" } });
    await setDoc(doc(admin, "goals/alice-goal"), { ...goal("alice"), currentAmount: 40000 });
    await setDoc(doc(admin, "goals/alice-goal/entries/e1"), { kind: "contribution", amount: 40000, verified: false, note: "", createdAt: "2026-10-20T12:00:00.000Z" });
    await setDoc(doc(admin, "transactions/t1"), { userId: "alice", amount: 4200, category: "dining", merchant: "TACO LOCO", date: "2026-10-20", recurringId: null });
    await setDoc(doc(admin, "recurring/alice_rent"), { userId: "alice", merchant: "RENT", amount: 90000, cadence: "monthly", nextDue: "2026-11-01", category: "rent", isPayday: false });
    await setDoc(doc(admin, "accounts/alice"), { userId: "alice", currentBalance: 124000, asOf: "2026-10-24" });
    await setDoc(doc(admin, "banditStats/alice_no_spend_day_easy"), { userId: "alice", challengeType: "no_spend_day", difficulty: "easy", attempts: 2, completions: 1 });
    await setDoc(doc(admin, "challenges/c1"), { userId: "alice", type: "no_spend_day", description: "One no-spend day", points: 30, difficulty: "easy", status: "active", createdAt: "2026-10-24T12:00:00.000Z", completedAt: null, reason: "" });
    await setDoc(doc(admin, "scores/alice"), { userId: "alice", goalProgressPct: 40, streak: 2, improvementScore: 10, points: 120, level: 2 });
  });
});

describe("a group member can't see another member's private data", () => {
  it("can't read their goal, its entries, or query for it", async () => {
    await assertFails(getDoc(doc(db("bob"), "goals/alice-goal")));
    await assertFails(getDocs(collection(db("bob"), "goals/alice-goal/entries")));
    await assertFails(getDocs(query(collection(db("bob"), "goals"), where("ownerId", "==", "alice"))));
  });

  it("can't read their transactions, by id or by query", async () => {
    await assertFails(getDoc(doc(db("bob"), "transactions/t1")));
    await assertFails(getDocs(query(collection(db("bob"), "transactions"), where("userId", "==", "alice"))));
  });

  it("can't read their profile, recurring bills, balance, or challenges", async () => {
    await assertFails(getDoc(doc(db("bob"), "users/alice")));
    await assertFails(getDoc(doc(db("bob"), "recurring/alice_rent")));
    await assertFails(getDoc(doc(db("bob"), "accounts/alice")));
    await assertFails(getDoc(doc(db("bob"), "challenges/c1")));
  });

  it("can read their score, but someone outside the group can't", async () => {
    await assertSucceeds(getDoc(doc(db("bob"), "scores/alice")));
    await assertFails(getDoc(doc(db("carol"), "scores/alice")));
    await assertFails(getDoc(doc(anon(), "scores/alice")));
  });
});

describe("server-only collections", () => {
  it("even the owner can't read or write transactions, recurring, accounts, banditStats, scoreViewers, squad goals", async () => {
    const paths = ["transactions/t1", "recurring/alice_rent", "accounts/alice", "banditStats/alice_no_spend_day_easy", "scoreViewers/alice", "squadGoals/g1", "squadGoals/g1/contributions/c1"];
    for (const path of paths) {
      await assertFails(getDoc(doc(db("alice"), path)));
      await assertFails(setDoc(doc(db("alice"), path), { userId: "alice" }));
    }
    await assertFails(getDocs(query(collection(db("alice"), "transactions"), where("userId", "==", "alice"))));
  });

  it("nobody can write scores, not even the owner", async () => {
    await assertSucceeds(getDoc(doc(db("alice"), "scores/alice")));
    await assertFails(updateDoc(doc(db("alice"), "scores/alice"), { points: 9999 }));
    await assertFails(setDoc(doc(db("bob"), "scores/bob"), { userId: "bob", points: 9999 }));
  });
});

describe("challenges", () => {
  it("are readable by the owner, including by query", async () => {
    await assertSucceeds(getDoc(doc(db("alice"), "challenges/c1")));
    await assertSucceeds(getDocs(query(collection(db("alice"), "challenges"), where("userId", "==", "alice"))));
  });

  it("can't be completed, created, or deleted by the client", async () => {
    await assertFails(updateDoc(doc(db("alice"), "challenges/c1"), { status: "completed", completedAt: "2026-10-24T13:00:00.000Z" }));
    await assertFails(addDoc(collection(db("alice"), "challenges"), { userId: "alice", type: "no_spend_day", points: 500, status: "completed" }));
    await assertFails(deleteDoc(doc(db("alice"), "challenges/c1")));
  });
});

describe("users", () => {
  it("can read and edit their own name and settings", async () => {
    await assertSucceeds(getDoc(doc(db("alice"), "users/alice")));
    await assertSucceeds(updateDoc(doc(db("alice"), "users/alice"), { displayName: "Ali" }));
  });

  it("can't set their own baseline (it would inflate the improvement score)", async () => {
    await assertFails(updateDoc(doc(db("alice"), "users/alice"), { baselineSpendByCategory: { dining: 999999 } }));
    await assertFails(setDoc(doc(db("carol"), "users/carol"), { displayName: "Carol", baselineSpendByCategory: { dining: 999999 }, settings: {} }));
    await assertSucceeds(setDoc(doc(db("carol"), "users/carol"), { displayName: "Carol", baselineSpendByCategory: {}, settings: {} }));
  });

  it("can't write someone else's profile", async () => {
    await assertFails(setDoc(doc(db("bob"), "users/alice"), { displayName: "Hacked", baselineSpendByCategory: {}, settings: {} }));
  });
});

describe("goals", () => {
  it("are readable and editable by the owner", async () => {
    await assertSucceeds(getDoc(doc(db("alice"), "goals/alice-goal")));
    await assertSucceeds(getDocs(query(collection(db("alice"), "goals"), where("ownerId", "==", "alice"))));
    await assertSucceeds(updateDoc(doc(db("alice"), "goals/alice-goal"), { name: "Bigger trip" }));
    await assertSucceeds(addDoc(collection(db("alice"), "goals"), goal("alice")));
  });

  it("can't be marked verified or created for someone else", async () => {
    await assertFails(updateDoc(doc(db("alice"), "goals/alice-goal"), { verified: true }));
    await assertFails(addDoc(collection(db("alice"), "goals"), { ...goal("alice"), verified: true }));
    await assertFails(addDoc(collection(db("alice"), "goals"), goal("bob")));
  });

  it("can't set auto-save directly (setAutoSave validates it)", async () => {
    await assertFails(updateDoc(doc(db("alice"), "goals/alice-goal"), { autoSave: { kind: "percentOfBalance", percent: 100 } }));
    await assertFails(updateDoc(doc(db("alice"), "goals/alice-goal"), { autoSaveLastRunOn: "2026-10-24" }));
    await assertFails(addDoc(collection(db("alice"), "goals"), { ...goal("alice"), autoSave: { kind: "fixed", amount: 100 } }));
  });

  it("only accept unverified contributions", async () => {
    const entries = collection(db("alice"), "goals/alice-goal/entries");
    const entry = { kind: "contribution", amount: 2500, note: "", createdAt: "2026-10-24T12:00:00.000Z" };
    await assertSucceeds(addDoc(entries, { ...entry, verified: false }));
    await assertFails(addDoc(entries, { ...entry, verified: true }));
    await assertFails(addDoc(collection(db("bob"), "goals/alice-goal/entries"), { ...entry, verified: false }));
  });
});

describe("groups", () => {
  it("are readable by members only", async () => {
    await assertSucceeds(getDoc(doc(db("bob"), "groups/g1")));
    await assertFails(getDoc(doc(db("carol"), "groups/g1")));
  });

  it("can't be joined by editing members directly (joinGroup does that)", async () => {
    await assertFails(updateDoc(doc(db("carol"), "groups/g1"), { members: ["alice", "bob", "carol"] }));
    await assertFails(updateDoc(doc(db("bob"), "groups/g1"), { members: ["alice", "bob", "carol"] }));
  });
});
