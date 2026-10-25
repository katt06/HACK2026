import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import type {
  AccountDoc,
  ContributeToSquadGoalRequest,
  ContributeToSquadGoalResponse,
  CreateSquadGoalRequest,
  CreateSquadGoalResponse,
  GetSquadGoalRequest,
  GetSquadGoalResponse,
  GroupDoc,
  SquadContributionDoc,
  SquadGoalDoc,
  UserDoc,
} from "./contract.js";
import { todayIso } from "./logic/dates.js";
import { formatCents } from "./logic/money.js";
import { newMilestones, squadSummary, validateSquadGoal } from "./logic/squad.js";
import { debitForSavings } from "./savingsTransfer.js";
import { recomputeQuietly } from "./scoreStore.js";
import { requireAuth, requireString } from "./validate.js";

// squadGoals/{groupId} and its contributions are server-only; members read them through getSquadGoal,
// which never returns other people's dollar amounts.

async function memberGroup(db: Firestore, groupId: string, uid: string): Promise<GroupDoc> {
  const group = (await db.doc(`groups/${groupId}`).get()).data() as GroupDoc | undefined;
  // Same answer for "doesn't exist" and "not yours", so group ids can't be probed.
  if (!group || !group.members.includes(uid)) throw new HttpsError("not-found", "Group not found.");
  return group;
}

async function userToday(db: Firestore, uid: string) {
  const user = (await db.doc(`users/${uid}`).get()).data() as UserDoc | undefined;
  return todayIso(new Date(), user?.settings?.timezone);
}

async function contributionsOf(db: Firestore, groupId: string): Promise<SquadContributionDoc[]> {
  return (await db.collection(`squadGoals/${groupId}/contributions`).get()).docs.map((d) => d.data() as SquadContributionDoc);
}

export const createSquadGoal = onCall<CreateSquadGoalRequest>(async (request): Promise<CreateSquadGoalResponse> => {
  const uid = requireAuth(request);
  const groupId = requireString(request.data?.groupId, "groupId");
  const db = getFirestore();
  const [group, today] = await Promise.all([memberGroup(db, groupId, uid), userToday(db, uid)]);
  const problem = validateSquadGoal(request.data ?? {}, today);
  if (problem) throw new HttpsError("invalid-argument", problem);

  const squad: SquadGoalDoc = {
    groupId,
    name: request.data.name.trim(),
    targetAmount: request.data.targetAmount,
    currentAmount: 0,
    deadline: request.data.deadline,
    createdBy: uid,
    createdAt: new Date().toISOString(),
    completedAt: null,
  };
  const ref = db.doc(`squadGoals/${groupId}`);
  await db.runTransaction(async (tx) => {
    if ((await tx.get(ref)).exists) throw new HttpsError("already-exists", "This group already has a squad goal.");
    tx.set(ref, squad);
  });
  return { squadGoal: squadSummary(groupId, squad, [], group, uid, today) };
});

export const getSquadGoal = onCall<GetSquadGoalRequest>(async (request): Promise<GetSquadGoalResponse> => {
  const uid = requireAuth(request);
  const groupId = requireString(request.data?.groupId, "groupId");
  const db = getFirestore();
  const [group, today] = await Promise.all([memberGroup(db, groupId, uid), userToday(db, uid)]);
  const squad = (await db.doc(`squadGoals/${groupId}`).get()).data() as SquadGoalDoc | undefined;
  if (!squad) return { squadGoal: null };
  return { squadGoal: squadSummary(groupId, squad, await contributionsOf(db, groupId), group, uid, today) };
});

// Moves money from the caller's tracked checking balance into the squad goal.
export const contributeToSquadGoal = onCall<ContributeToSquadGoalRequest>(async (request): Promise<ContributeToSquadGoalResponse> => {
  const uid = requireAuth(request);
  const groupId = requireString(request.data?.groupId, "groupId");
  const amount = request.data?.amount;
  if (!Number.isInteger(amount) || amount <= 0) throw new HttpsError("invalid-argument", "amount must be a positive whole number of cents.");
  const db = getFirestore();
  const [group, today] = await Promise.all([memberGroup(db, groupId, uid), userToday(db, uid)]);
  const squadRef = db.doc(`squadGoals/${groupId}`);

  const { squad, newBalance, unlocked } = await db.runTransaction(async (tx) => {
    const [squadSnap, accountSnap] = await Promise.all([tx.get(squadRef), tx.get(db.doc(`accounts/${uid}`))]);
    const current = squadSnap.data() as SquadGoalDoc | undefined;
    if (!current) throw new HttpsError("not-found", "This group doesn't have a squad goal yet.");
    if (current.completedAt) throw new HttpsError("failed-precondition", "This squad goal is already complete.");
    const account = accountSnap.data() as AccountDoc | undefined;
    if (!account) throw new HttpsError("failed-precondition", "Connect a checking account first.");
    if (amount > account.currentBalance) throw new HttpsError("failed-precondition", `You have ${formatCents(account.currentBalance)} in checking.`);
    const toTarget = current.targetAmount - current.currentAmount;
    if (amount > toTarget) throw new HttpsError("failed-precondition", `Only ${formatCents(toTarget)} is left to reach this goal.`);

    const balance = debitForSavings(tx, db, uid, account, amount, today);
    const now = new Date().toISOString();
    const contribution: SquadContributionDoc = { userId: uid, amount, createdAt: now };
    tx.set(squadRef.collection("contributions").doc(), contribution);
    const updated: SquadGoalDoc = {
      ...current,
      currentAmount: current.currentAmount + amount,
      completedAt: current.currentAmount + amount >= current.targetAmount ? now : null,
    };
    tx.update(squadRef, { currentAmount: updated.currentAmount, completedAt: updated.completedAt });
    return { squad: updated, newBalance: balance, unlocked: newMilestones(current.targetAmount, current.currentAmount, updated.currentAmount) };
  });

  return {
    squadGoal: squadSummary(groupId, squad, await contributionsOf(db, groupId), group, uid, today),
    newBalance,
    newMilestones: unlocked,
  };
});

// Milestones change everyone's bonus points, and contributions change the contributor's streak,
// so any squad goal change recomputes every member's score.
export const onSquadGoalWritten = onDocumentWritten("squadGoals/{groupId}", async (event) => {
  const group = (await getFirestore().doc(`groups/${event.params.groupId}`).get()).data() as GroupDoc | undefined;
  await Promise.all((group?.members ?? []).map((uid) => recomputeQuietly(uid)));
});
