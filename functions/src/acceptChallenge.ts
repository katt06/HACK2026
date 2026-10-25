import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import type { AcceptChallengeRequest, AcceptChallengeResponse, ChallengeDoc } from "./contract.js";
import { banditOutcome } from "./banditStore.js";
import { statsDelta } from "./logic/bandit.js";
import { requireAuth, requireString } from "./validate.js";

// The user said "I'm in": active → accepted, which counts as a bandit attempt. Accepting twice is a no-op.
export const acceptChallenge = onCall<AcceptChallengeRequest>(async (request): Promise<AcceptChallengeResponse> => {
  const uid = requireAuth(request);
  const challengeId = requireString(request.data?.challengeId, "challengeId");
  const db = getFirestore();
  const ref = db.doc(`challenges/${challengeId}`);

  const challenge = await db.runTransaction(async (tx) => {
    const current = (await tx.get(ref)).data() as ChallengeDoc | undefined;
    if (!current || current.userId !== uid) throw new HttpsError("not-found", "Challenge not found.");
    if (current.status === "accepted") return current;
    if (current.status !== "active") throw new HttpsError("failed-precondition", `This challenge is already ${current.status}.`);
    tx.update(ref, { status: "accepted" });
    const [statsRef, stats] = banditOutcome(db, uid, current, statsDelta(current.status, "accept"));
    tx.set(statsRef, stats, { merge: true });
    return { ...current, status: "accepted" as const };
  });
  return { challenge: { id: challengeId, ...challenge } };
});
