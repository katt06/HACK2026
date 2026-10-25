import { useState } from "react";
import { FirebaseError } from "firebase/app";
import { DEFAULT_AVATAR, ITEM_ORDER, SHOP_ITEMS, type AvatarSlot, type ItemId } from "@contract";
import { api } from "../api";
import { Avatar, describeAvatar } from "../avatar/Avatar";
import { PageHeader } from "../components/AppLayout";
import { Skeleton } from "../components/Skeleton";
import { CoinCounter, CoinIcon } from "../game/CoinCounter";
import { useGame } from "../game/GameContext";

const SLOT_LABEL: Record<AvatarSlot, string> = { hat: "Hat", glasses: "Glasses", outfit: "Outfit", held: "Snack" };

function friendly(err: unknown): string {
  // The server's own messages are written for people ("Not enough coins yet."); anything else gets a calm default.
  if (err instanceof FirebaseError && err.code.endsWith("failed-precondition")) return err.message.replace(/^.*?:\s*/, "").replace(/\s*\(.*\)\.?$/, "");
  return "The shop is taking a breather. Try again in a moment.";
}

export default function Shop() {
  const game = useGame();
  const [busy, setBusy] = useState<ItemId | null>(null);
  const [notice, setNotice] = useState<{ text: string; tone: "good" | "warn" } | null>(null);
  const state = game.state;

  async function act(itemId: ItemId, run: () => Promise<unknown>, done: string) {
    setBusy(itemId);
    setNotice(null);
    try {
      await run();
      await game.refresh();
      setNotice({ text: done, tone: "good" });
    } catch (err) {
      console.error(err);
      setNotice({ text: friendly(err), tone: "warn" });
    } finally {
      setBusy(null);
    }
  }

  if (!state) {
    return (
      <>
        <PageHeader title="Capy shop" subtitle="Spend coins from challenges on a new look." />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-72 w-full" />
          ))}
        </div>
      </>
    );
  }

  const avatar = state.avatar ?? DEFAULT_AVATAR;

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader title="Capy shop" subtitle="Spend coins from challenges on a new look." />
        {/* Phones already show coins in the header. */}
        <div className="hidden lg:block">
          <CoinCounter coins={state.coins} size="lg" />
        </div>
      </div>

      <section className="card mb-6 flex items-center gap-5 p-5 lg:p-6">
        <div className="rounded-3xl bg-sky-soft p-2">
          <Avatar avatar={avatar} size={128} label={describeAvatar(avatar)} />
        </div>
        <div>
          <h2 className="text-xl font-extrabold">Your capy</h2>
          <p className="mt-1 text-ink-muted">Your group sees this look on the leaderboard and in the member list.</p>
        </div>
      </section>

      {notice && (
        <p
          role="status"
          className={`mb-4 rounded-2xl border-2 px-4 py-2 font-extrabold ${
            notice.tone === "good" ? "border-mint bg-primary-soft text-heading" : "border-coin bg-warn-soft text-warn-ink"
          }`}
        >
          {notice.text}
        </p>
      )}

      <ul className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {ITEM_ORDER.map((id) => {
          const item = SHOP_ITEMS[id];
          const owned = state.owned.includes(id);
          const equipped = avatar[item.slot] === id;
          const short = item.price - state.coins;
          const preview = { ...avatar, [item.slot]: id };
          const working = busy === id;
          return (
            <li key={id} className={`card flex flex-col p-3 sm:p-4 ${equipped ? "border-leaf" : ""}`}>
              <div className="flex justify-center rounded-2xl bg-sky-soft py-2">
                <Avatar avatar={preview} size={128} className="h-24 w-24 sm:h-32 sm:w-32" label={`Preview: ${describeAvatar(preview)}`} />
              </div>
              <div className="mt-3 flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-extrabold">{item.name}</h3>
                  <p className="text-xs font-bold uppercase tracking-wide text-ink-faint">{SLOT_LABEL[item.slot]}</p>
                </div>
                {owned ? (
                  <span className={`rounded-full px-2 py-0.5 text-xs font-extrabold ${equipped ? "bg-primary text-on-primary" : "bg-primary-soft text-heading"}`}>
                    {equipped ? "Wearing" : "Owned"}
                  </span>
                ) : (
                  <span className="flex items-center gap-1 font-extrabold tabular-nums">
                    <CoinIcon className="h-5 w-5" />
                    {item.price}
                  </span>
                )}
              </div>

              <div className="mt-auto pt-4">
                {!owned && short > 0 && (
                  <>
                    <button disabled className="btn btn-secondary btn-sm w-full">
                      Not enough coins
                    </button>
                    <p className="mt-1 text-center text-xs text-ink-muted">{short} more to go. Challenges earn coins.</p>
                  </>
                )}
                {!owned && short <= 0 && (
                  <button
                    onClick={() => act(id, () => api.purchaseItem(id), `${item.name} is yours! Tap Equip to wear it.`)}
                    disabled={busy !== null}
                    className="btn btn-coin btn-sm w-full"
                  >
                    {working ? "Buying…" : `Buy for ${item.price}`}
                  </button>
                )}
                {owned && !equipped && (
                  <button
                    onClick={() => act(id, () => api.equipItem(item.slot, id), `Looking good in the ${item.name.toLowerCase()}.`)}
                    disabled={busy !== null}
                    className="btn btn-primary btn-sm w-full"
                  >
                    {working ? "Putting it on…" : "Equip"}
                  </button>
                )}
                {equipped && (
                  <button
                    onClick={() => act(id, () => api.equipItem(item.slot, null), `${item.name} off. Fresh look.`)}
                    disabled={busy !== null}
                    className="btn btn-ghost btn-sm w-full"
                  >
                    {working ? "Taking it off…" : "Take off"}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}
