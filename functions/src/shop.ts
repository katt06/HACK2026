import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import {
  DEFAULT_AVATAR,
  checkEquip,
  checkPurchase,
  isAvatarSlot,
  isItemId,
  ownedItems,
  type EquipItemRequest,
  type EquipItemResponse,
  type PurchaseItemRequest,
  type PurchaseItemResponse,
  type ScoreDoc,
  type UserDoc,
} from "./contract.js";
import { recomputeScore } from "./scoreStore.js";
import { requireAuth } from "./validate.js";

// Coins and inventory live on users/{uid}, which clients can't write (security rules), so buying only happens here.
export const purchaseItem = onCall<PurchaseItemRequest>(async (request): Promise<PurchaseItemResponse> => {
  const uid = requireAuth(request);
  const itemId = request.data?.itemId;
  if (!isItemId(itemId)) throw new HttpsError("invalid-argument", "That item isn't in the shop.");
  const db = getFirestore();
  const userRef = db.doc(`users/${uid}`);
  const scoreRef = db.doc(`scores/${uid}`);

  return db.runTransaction(async (tx) => {
    const [userSnap, scoreSnap] = await Promise.all([tx.get(userRef), tx.get(scoreRef)]);
    const user = userSnap.data() as UserDoc | undefined;
    // Before the first coin is tracked, the balance is all XP earned (same fallback as the app).
    const coins = user?.coins ?? (scoreSnap.data() as ScoreDoc | undefined)?.points ?? 0;
    const result = checkPurchase(coins, user?.inventory, itemId);
    if (!result.ok) {
      throw new HttpsError("failed-precondition", result.reason === "owned" ? "You already have this one." : "Not enough coins yet.");
    }
    tx.set(userRef, { coins: result.coins, inventory: result.inventory }, { merge: true });
    return { coins: result.coins, owned: ownedItems(result.inventory) };
  });
});

// The equipped avatar is stored on scores/{uid}, which group members can already read, so the
// leaderboard and member list can show it without opening up anything private.
export const equipItem = onCall<EquipItemRequest>(async (request): Promise<EquipItemResponse> => {
  const uid = requireAuth(request);
  const { slot, itemId } = request.data ?? {};
  if (!isAvatarSlot(slot)) throw new HttpsError("invalid-argument", "Unknown slot.");
  if (itemId !== null && !isItemId(itemId)) throw new HttpsError("invalid-argument", "That item isn't in the shop.");
  const db = getFirestore();
  const userRef = db.doc(`users/${uid}`);
  const scoreRef = db.doc(`scores/${uid}`);
  if (!(await scoreRef.get()).exists) await recomputeScore(db, uid); // so the avatar never sits on a half-empty score

  return db.runTransaction(async (tx) => {
    const [userSnap, scoreSnap] = await Promise.all([tx.get(userRef), tx.get(scoreRef)]);
    const current = (scoreSnap.data() as ScoreDoc).avatar ?? DEFAULT_AVATAR;
    const result = checkEquip(current, (userSnap.data() as UserDoc | undefined)?.inventory, slot, itemId);
    if (!result.ok) throw new HttpsError("failed-precondition", result.reason === "not-owned" ? "Buy this item first." : "That item doesn't go there.");
    // update (not a merge) replaces the whole map, so taking an item off really removes it.
    tx.update(scoreRef, { avatar: result.avatar });
    return { avatar: result.avatar };
  });
});
