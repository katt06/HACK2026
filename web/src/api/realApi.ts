import { httpsCallable } from "firebase/functions";
import { FirebaseError } from "firebase/app";
import {
  addDoc,
  collection,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  increment,
  onSnapshot,
  orderBy,
  query,
  where,
  writeBatch,
} from "firebase/firestore";
import {
  evaluateBadges,
  levelProgress,
  toGroupSummary,
  type CallableName,
  type ChallengeDoc,
  type Callables,
  type ContributionEntry,
  type ExpenseEntry,
  type GoalDoc,
  type GoalEntryDoc,
  type GroupDoc,
  type ScoreDoc,
  type UserDoc,
} from "@contract";
import { auth, db, functions } from "../firebase";
import { generateInviteCode } from "../lib/inviteCode";
import type { Api } from "./types";

type Req<K extends CallableName> = Callables[K]["request"];
type Res<K extends CallableName> = Callables[K]["response"];

async function call<K extends CallableName>(name: K, data: Req<K>): Promise<Res<K>> {
  const fn = httpsCallable<Req<K>, Res<K>>(functions, name);
  const result = await fn(data);
  return result.data;
}

function signedInUser() {
  if (!auth.currentUser) throw new Error("Sign in to continue.");
  return auth.currentUser;
}

const byDeadline = (a: GoalDoc, b: GoalDoc) => a.deadline.localeCompare(b.deadline);

const myGroupsQuery = (uid: string) => query(collection(db, "groups"), where("members", "array-contains", uid));

export const realApi: Api = {
  getSafeToSave: () => call("getSafeToSave", {}),
  getChallenges: () => call("getChallenges", {}),
  acceptChallenge: (challengeId) => call("acceptChallenge", { challengeId }),
  completeChallenge: (challengeId) => call("completeChallenge", { challengeId }),
  getLeaderboard: (groupId) => call("getLeaderboard", { groupId }),
  // Built from data the client may already read. Coins fall back to XP until the server tracks spending,
  // and badges combine what the server has awarded with what the stats show.
  async getGameState() {
    const { uid } = signedInUser();
    const [scoreSnap, userSnap, goals, completed] = await Promise.all([
      getDoc(doc(db, "scores", uid)),
      getDoc(doc(db, "users", uid)),
      getDocs(query(collection(db, "goals"), where("ownerId", "==", uid))),
      getCountFromServer(query(collection(db, "challenges"), where("userId", "==", uid), where("status", "==", "completed")))
        .then((c) => c.data().count)
        .catch(() => 0),
    ]);
    const score = scoreSnap.exists() ? (scoreSnap.data() as ScoreDoc) : null;
    const xp = score?.points ?? 0;
    return {
      xp,
      ...levelProgress(xp),
      coins: (userSnap.exists() ? (userSnap.data() as UserDoc).coins : undefined) ?? xp,
      badges: evaluateBadges({ goalsCreated: goals.size, streak: score?.streak ?? 0, challengesCompleted: completed }, score?.badges ?? []),
    };
  },
  // All of this is my own data, which rules let me read directly.
  async getActivity() {
    const { uid } = signedInUser();
    const [challenges, goals, scoreSnap] = await Promise.all([
      getDocs(query(collection(db, "challenges"), where("userId", "==", uid), where("status", "==", "completed"))),
      getDocs(query(collection(db, "goals"), where("ownerId", "==", uid))),
      getDoc(doc(db, "scores", uid)),
    ]);
    const entries = await Promise.all(
      goals.docs.map(async (g) => {
        const snap = await getDocs(query(collection(g.ref, "entries"), where("kind", "==", "contribution")));
        return snap.docs.map((d) => ({ goalName: (g.data() as GoalDoc).name, ...(d.data() as ContributionEntry) }));
      }),
    );
    return {
      completedChallenges: challenges.docs
        .map((d) => ({ id: d.id, ...(d.data() as ChallengeDoc) }))
        .filter((c) => c.completedAt)
        .map((c) => ({ id: c.id, description: c.description, points: c.points, completedAt: c.completedAt! })),
      contributions: entries.flat().map((e) => ({ goalName: e.goalName, amount: e.amount, createdAt: e.createdAt })),
      streak: scoreSnap.exists() ? (scoreSnap.data() as ScoreDoc).streak : 0,
    };
  },
  async getMyScore() {
    const snap = await getDoc(doc(db, "scores", signedInUser().uid));
    return snap.exists() ? (snap.data() as ScoreDoc) : null;
  },

  // Groups are read and created directly in Firestore (security rules enforce the shape);
  // joining needs the Admin SDK, so it goes through a callable.
  async getMyGroups() {
    const { uid } = signedInUser();
    const snap = await getDocs(myGroupsQuery(uid));
    return snap.docs.map((d) => toGroupSummary(d.id, d.data() as GroupDoc, uid));
  },
  watchMyGroups(onChange, onError) {
    const { uid } = signedInUser();
    return onSnapshot(
      myGroupsQuery(uid),
      (snap) => onChange(snap.docs.map((d) => toGroupSummary(d.id, d.data() as GroupDoc, uid))),
      onError,
    );
  },
  async createGroup(name) {
    const user = signedInUser();
    const group: GroupDoc = {
      name: name.trim(),
      members: [user.uid],
      memberNames: { [user.uid]: user.displayName || "Member" },
      inviteCode: generateInviteCode(),
    };
    const ref = await addDoc(collection(db, "groups"), group);
    return toGroupSummary(ref.id, group, user.uid);
  },
  joinGroup: (inviteCode) => call("joinGroup", { inviteCode }),

  // Goals and their entries are the owner's own data, read and written directly (rules check ownership).
  async getMyGoals() {
    const snap = await getDocs(query(collection(db, "goals"), where("ownerId", "==", signedInUser().uid)));
    return snap.docs.map((d) => ({ ...(d.data() as GoalDoc), id: d.id })).sort(byDeadline);
  },
  async getGoal(goalId) {
    signedInUser();
    const ref = doc(db, "goals", goalId);
    let goalSnap;
    try {
      goalSnap = await getDoc(ref);
    } catch (err) {
      // Rules deny reads of other people's goals; to the UI that's the same as missing.
      if (err instanceof FirebaseError && err.code === "permission-denied") throw new FirebaseError("not-found", "Goal not found.");
      throw err;
    }
    if (!goalSnap.exists()) throw new FirebaseError("not-found", "Goal not found.");
    const entries = await getDocs(query(collection(ref, "entries"), orderBy("createdAt", "desc")));
    return {
      goal: { ...(goalSnap.data() as GoalDoc), id: goalSnap.id },
      entries: entries.docs.map((d) => ({ ...(d.data() as GoalEntryDoc), id: d.id })),
    };
  },
  async createGoal({ name, targetAmount, deadline }) {
    const goal: GoalDoc = {
      ownerId: signedInUser().uid,
      name: name.trim(),
      targetAmount,
      currentAmount: 0,
      deadline,
      verified: false,
      sizingRecommendation: null,
      pausedUntil: null,
      createdAt: new Date().toISOString(),
    };
    const ref = await addDoc(collection(db, "goals"), goal);
    return { ...goal, id: ref.id };
  },
  async addContribution(goalId, amount, note = "") {
    signedInUser();
    const ref = doc(db, "goals", goalId);
    const entry: ContributionEntry = { kind: "contribution", amount, verified: false, note: note.trim(), createdAt: new Date().toISOString() };
    const batch = writeBatch(db);
    batch.set(doc(collection(ref, "entries")), entry);
    batch.update(ref, { currentAmount: increment(amount) });
    await batch.commit();
  },
  async applyGoalFlex(goalId, expenseAmount, option, note = "") {
    signedInUser();
    const ref = doc(db, "goals", goalId);
    const entry: ExpenseEntry = {
      kind: "expense",
      amount: expenseAmount,
      choice: option.choice,
      weeksLater: option.weeksLater,
      note: note.trim(),
      createdAt: new Date().toISOString(),
    };
    const batch = writeBatch(db);
    batch.set(doc(collection(ref, "entries")), entry);
    batch.update(ref, { deadline: option.newDeadline, pausedUntil: option.pausedUntil });
    await batch.commit();
  },
};
