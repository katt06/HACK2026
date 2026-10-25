import { FieldValue, type DocumentReference, type Firestore } from "firebase-admin/firestore";
import type { BanditStatsDoc, ChallengeDoc, ChallengeType, Difficulty } from "./contract.js";
import { banditStatsId, isExpired, OPEN_STATUSES, statsDelta, type ArmStats } from "./logic/bandit.js";

export async function loadBanditStats(db: Firestore, uid: string): Promise<BanditStatsDoc[]> {
  const snap = await db.collection("banditStats").where("userId", "==", uid).get();
  return snap.docs.map((d) => d.data() as BanditStatsDoc);
}

// The write that applies a statsDelta, for use inside a transaction (increments are atomic). Merge it.
export function banditOutcome(
  db: Firestore,
  uid: string,
  arm: { type: ChallengeType; difficulty: Difficulty },
  delta: ArmStats,
): [DocumentReference, Record<string, unknown>] {
  return [
    db.doc(`banditStats/${banditStatsId(uid, arm)}`),
    {
      userId: uid,
      challengeType: arm.type,
      difficulty: arm.difficulty,
      attempts: FieldValue.increment(delta.attempts),
      completions: FieldValue.increment(delta.completions),
    },
  ];
}

// Challenges left open past their week are expired: a failure for that arm (an ignored offer counts its attempt
// now; an accepted one already did). Each is its own transaction, so a challenge completed at the same moment
// is never counted twice.
export async function expireStaleChallenges(db: Firestore, uid: string, now = new Date()): Promise<number> {
  const active = await db.collection("challenges").where("userId", "==", uid).where("status", "in", [...OPEN_STATUSES]).get();
  let expired = 0;
  for (const doc of active.docs) {
    if (!isExpired(doc.data() as ChallengeDoc, now)) continue;
    const didExpire = await db.runTransaction(async (tx) => {
      const current = (await tx.get(doc.ref)).data() as ChallengeDoc | undefined;
      if (!current || !isExpired(current, now)) return false;
      tx.update(doc.ref, { status: "expired" });
      const [ref, data] = banditOutcome(db, uid, current, statsDelta(current.status, "expire"));
      tx.set(ref, data, { merge: true });
      return true;
    });
    if (didExpire) expired++;
  }
  return expired;
}
