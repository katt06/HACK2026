import { useCallback, useEffect, useState } from "react";
import type { ChallengeDoc, WithId } from "@contract";
import { api } from "../api";
import { PageHeader } from "../components/AppLayout";
import { Difficulty } from "../components/Difficulty";
import { EmptyState } from "../components/EmptyState";
import { cardClass } from "../components/forms";
import { PointsBurst } from "../components/PointsBurst";
import { Skeleton } from "../components/Skeleton";
import { useCooldown } from "../lib/useCooldown";
import { useGame } from "../game/GameContext";
import { LevelBar } from "../game/LevelBar";

const REFRESH_COOLDOWN_MS = 30_000;

type Challenge = WithId<ChallengeDoc>;

function LevelCard() {
  const { state } = useGame();
  if (!state) return null;
  return (
    <div className="card w-44 shrink-0 px-4 py-3 lg:w-64">
      <LevelBar level={state.level} xpIntoLevel={state.xpIntoLevel} xpPerLevel={state.xpPerLevel} compact />
    </div>
  );
}

function ChallengeCard({
  challenge,
  burstKey,
  onAccept,
  onComplete,
}: {
  challenge: Challenge;
  burstKey: number | undefined;
  onAccept: (c: Challenge) => Promise<void>;
  onComplete: (c: Challenge) => Promise<void>;
}) {
  const [showWhy, setShowWhy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const done = challenge.status === "completed";

  async function run(action: (c: Challenge) => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await action(challenge);
    } catch {
      setError("Couldn't save that just now. Give it another tap.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className={`relative flex flex-col rounded-2xl border-2 p-5 transition-colors lg:p-6 ${done ? "border-leaf bg-primary-soft" : "border-line bg-surface"}`}>
      {burstKey !== undefined && <PointsBurst key={burstKey} points={challenge.points} />}

      <div className="flex items-center justify-between">
        <Difficulty level={challenge.difficulty} />
        <span className="text-sm font-extrabold text-link">+{challenge.points} XP</span>
      </div>

      <p className="mt-3 flex-1 text-lg font-semibold leading-snug lg:text-xl">{challenge.description}</p>

      <button
        onClick={() => setShowWhy(!showWhy)}
        aria-expanded={showWhy}
        className="mt-3 self-start text-sm font-semibold text-ink-muted hover:text-ink"
      >
        Why this challenge? <span aria-hidden>{showWhy ? "▴" : "▾"}</span>
      </button>
      {showWhy && <p className="mt-1 rounded-xl bg-surface-2 p-3 text-sm text-ink-muted">{challenge.reason}</p>}

      <div className="mt-4">
        {done ? (
          <p className="rounded-2xl bg-coin px-4 py-3 text-center font-extrabold text-on-coin">Done! +{challenge.points} XP</p>
        ) : challenge.status === "accepted" ? (
          <div className="space-y-2">
            <p className="text-center text-xs font-semibold uppercase tracking-wide text-link">You're in</p>
            <button
              onClick={() => run(onComplete)}
              disabled={busy}
              className="btn btn-coin w-full"
            >
              {busy ? "Saving…" : "Mark complete"}
            </button>
          </div>
        ) : (
          <button
            onClick={() => run(onAccept)}
            disabled={busy}
            className="btn btn-primary w-full"
          >
            {busy ? "Saving…" : "Accept challenge"}
          </button>
        )}
        {error && <p className="mt-2 text-sm text-danger">{error}</p>}
      </div>
    </li>
  );
}

export default function Challenges() {
  const [challenges, setChallenges] = useState<Challenge[] | null>(null);
  const game = useGame();
  const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");
  const [bursts, setBursts] = useState<Record<string, number>>({});
  const [notice, setNotice] = useState("");
  const cooldown = useCooldown("challenges-refresh", REFRESH_COOLDOWN_MS);

  const load = useCallback(() => {
    setStatus("loading");
    setBursts({});
    api.getChallenges().then(
      (res) => {
        setChallenges(res.challenges);
        setStatus("ready");
      },
      (err) => {
        console.error(err);
        setStatus("failed");
      },
    );
  }, []);

  useEffect(load, [load]);

  const replace = (updated: Challenge) => setChallenges((cs) => cs?.map((c) => (c.id === updated.id ? updated : c)) ?? null);

  async function accept(c: Challenge) {
    const { challenge } = await api.acceptChallenge(c.id);
    replace(challenge);
  }

  async function complete(c: Challenge) {
    const res = await api.completeChallenge(c.id);
    replace(res.challenge);
    setBursts((b) => ({ ...b, [c.id]: Date.now() }));
    setNotice(`Nice and steady. +${res.pointsAwarded} XP and +${res.pointsAwarded} coins.`);
    void game.refresh(); // coin counter, level bar, and any level-up or badge celebration
  }

  function refresh() {
    if (cooldown.secondsLeft > 0) return;
    cooldown.start();
    setNotice("");
    load();
  }

  const open = challenges?.filter((c) => c.status !== "completed") ?? [];

  return (
    <>
      <div className="flex items-start justify-between gap-4">
        <PageHeader title="Challenges" subtitle="Small wins that add up." />
        <LevelCard />
      </div>

      <div className="mb-4 flex items-center justify-between gap-3">
        {notice ? (
          <p role="status" className="rounded-2xl border-2 border-mint bg-primary-soft px-4 py-2 font-extrabold text-heading">
            {notice}
          </p>
        ) : (
          <span />
        )}
        <button
          onClick={refresh}
          disabled={cooldown.secondsLeft > 0 || status === "loading"}
          className="btn btn-secondary btn-sm shrink-0"
        >
          {cooldown.secondsLeft > 0 ? `Refresh in ${cooldown.secondsLeft}s` : "Refresh"}
        </button>
      </div>

      {status === "loading" && (
        <ul className="grid gap-4 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <li key={i} className="card space-y-3 p-5">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-2/3" />
              <Skeleton className="h-11 w-full" />
            </li>
          ))}
        </ul>
      )}

      {status === "failed" && (
        <div className={`${cardClass} text-center`}>
          <p className="text-ink-muted">New challenges are on their way. Check back in a moment.</p>
          <button onClick={load} className="mt-2 font-semibold text-link">
            Try again
          </button>
        </div>
      )}

      {status === "ready" && challenges && (
        <>
          {open.length === 0 && (
            <div className="mb-4">
              <EmptyState mascot="float" title="All done. Time to chill.">
                New challenges show up as your spending changes. Check back later or tap Refresh.
              </EmptyState>
            </div>
          )}
          {challenges.length > 0 && (
            <ul className="grid gap-4 lg:grid-cols-3">
              {challenges.map((c) => (
                <ChallengeCard key={c.id} challenge={c} burstKey={bursts[c.id]} onAccept={accept} onComplete={complete} />
              ))}
            </ul>
          )}
        </>
      )}
    </>
  );
}
