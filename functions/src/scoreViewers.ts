import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { onDocumentWritten } from "firebase-functions/v2/firestore";
import type { GroupDoc, ScoreViewersDoc } from "./contract.js";
import { scoreViewersFor } from "./logic/scoreViewers.js";

export async function refreshScoreViewers(db: Firestore, uid: string): Promise<void> {
  const groups = await db.collection("groups").where("members", "array-contains", uid).get();
  const doc: ScoreViewersDoc = { uids: scoreViewersFor(uid, groups.docs.map((d) => d.data() as GroupDoc)) };
  await db.doc(`scoreViewers/${uid}`).set(doc);
}

// Any group change (create, join, delete) can change who may read whose score,
// so refresh everyone who was a member before or after.
export const syncScoreViewers = onDocumentWritten("groups/{groupId}", async (event) => {
  const before = (event.data?.before.data() as GroupDoc | undefined)?.members ?? [];
  const after = (event.data?.after.data() as GroupDoc | undefined)?.members ?? [];
  const db = getFirestore();
  await Promise.all([...new Set([...before, ...after])].map((uid) => refreshScoreViewers(db, uid)));
});
