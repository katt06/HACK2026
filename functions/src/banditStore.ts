import { FieldValue, type DocumentReference, type Firestore } from "firebase-admin/firestore";
import type { BanditStatsDoc, ChallengeDoc, ChallengeType, Difficulty } from "./contract.js";
import { banditStatsId, isExpired } from "./logic/bandit.js";

export async function loadBanditStats(db: Firestore, uid: string): Promise<BanditStatsDoc[]> {
  const snap = await db.collection("banditStats").where("userId", "==", uid).get();
  return snap.docs.map((d) => d.data() as BanditStatsDoc);
}

// The write that records one outcome, for use inside a transaction or batch (increments are atomic).
export function banditOutcome(
  db: Firestore,
  uid: string,
  arm: { type: ChallengeType; difficulty: Difficulty },
  success: boolean,
): [DocumentReference, Record<string, unknown>] {
  return [
    db.doc(`banditStats/${banditStatsId(uid, arm)}`),
    {
      userId: uid,
      challengeType: arm.type,
      difficulty: arm.difficulty,
      attempts: FieldValue.increment(1),
      completions: FieldValue.increment(success ? 1 : 0),
    },
  ];
}

// Challenges left active past their week were ignored: mark them expired and count a failure for that arm.
// Each one is its own transaction, so a challenge completed at the same moment is never counted twice.
export async function expireStaleChallenges(db: Firestore, uid: string, now = new Date()): Promise<number> {
  const active = await db.collection("challenges").where("userId", "==", uid).where("status", "==", "active").get();
  let expired = 0;
  for (const doc of active.docs) {
    if (!isExpired(doc.data() as ChallengeDoc, now)) continue;
    const didExpire = await db.runTransaction(async (tx) => {
      const current = (await tx.get(doc.ref)).data() as ChallengeDoc | undefined;
      if (!current || !isExpired(current, now)) return false;
      tx.update(doc.ref, { status: "expired" });
      const [ref, data] = banditOutcome(db, uid, current, false);
      tx.set(ref, data, { merge: true });
      return true;
    });
    if (didExpire) expired++;
  }
  return expired;
}
