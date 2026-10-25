import { useCallback, useEffect, useState } from "react";
import type { ChallengeDoc, ScoreDoc, WithId } from "@contract";
import { api } from "../api";
import { PageHeader } from "../components/AppLayout";
import { Difficulty } from "../components/Difficulty";
import { cardClass } from "../components/forms";
import { PointsBurst } from "../components/PointsBurst";
import { Skeleton } from "../components/Skeleton";
import { useCooldown } from "../lib/useCooldown";
import { useCountUp } from "../lib/useCountUp";

const REFRESH_COOLDOWN_MS = 30_000;

type Challenge = WithId<ChallengeDoc>;

function ScorePill({ score }: { score: ScoreDoc | null }) {
  const points = useCountUp(score?.points ?? 0);
  if (!score) return null;
  return (
    <div className="rounded-2xl bg-white px-4 py-2 text-right shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Level {score.level}</p>
      <p className="text-xl font-bold tabular-nums text-emerald-600 lg:text-2xl">{points} pts</p>
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
    <li className={`relative flex flex-col rounded-3xl p-5 shadow-sm transition-colors lg:p-6 ${done ? "bg-emerald-50 ring-2 ring-emerald-500" : "bg-white"}`}>
      {burstKey !== undefined && <PointsBurst key={burstKey} points={challenge.points} />}

      <div className="flex items-center justify-between">
        <Difficulty level={challenge.difficulty} />
        <span className="text-sm font-bold text-emerald-600">+{challenge.points} pts</span>
      </div>

      <p className="mt-3 flex-1 text-lg font-semibold leading-snug lg:text-xl">{challenge.description}</p>

      <button
        onClick={() => setShowWhy(!showWhy)}
        aria-expanded={showWhy}
        className="mt-3 self-start text-sm font-semibold text-slate-500 hover:text-slate-800"
      >
        Why this challenge? <span aria-hidden>{showWhy ? "▴" : "▾"}</span>
      </button>
      {showWhy && <p className="mt-1 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">{challenge.reason}</p>}

      <div className="mt-4">
        {done ? (
          <p className="rounded-xl bg-emerald-600 px-4 py-3 text-center font-semibold text-white">Done! +{challenge.points} pts</p>
        ) : challenge.status === "accepted" ? (
          <div className="space-y-2">
            <p className="text-center text-xs font-semibold uppercase tracking-wide text-emerald-700">You're in</p>
            <button
              onClick={() => run(onComplete)}
              disabled={busy}
              className="w-full rounded-xl bg-emerald-600 px-4 py-3 font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {busy ? "Saving…" : "Mark complete"}
            </button>
          </div>
        ) : (
          <button
            onClick={() => run(onAccept)}
            disabled={busy}
            className="w-full rounded-xl bg-slate-900 px-4 py-3 font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
          >
            {busy ? "Saving…" : "Accept challenge"}
          </button>
        )}
        {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}
      </div>
    </li>
  );
}

export default function Challenges() {
  const [challenges, setChallenges] = useState<Challenge[] | null>(null);
  const [score, setScore] = useState<ScoreDoc | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");
  const [bursts, setBursts] = useState<Record<string, number>>({});
  const [notice, setNotice] = useState("");
  const cooldown = useCooldown("challenges-refresh", REFRESH_COOLDOWN_MS);

  const load = useCallback(() => {
    setStatus("loading");
    setBursts({});
    Promise.all([api.getChallenges(), api.getMyScore().catch(() => null)]).then(
      ([res, myScore]) => {
        setChallenges(res.challenges);
        setScore(myScore);
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
    setScore(res.score);
    setBursts((b) => ({ ...b, [c.id]: Date.now() }));
    setNotice(res.leveledUp ? `Level ${res.score.level}! You earned ${res.pointsAwarded} points.` : `Nice! +${res.pointsAwarded} points.`);
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
        <ScorePill score={score} />
      </div>

      <div className="mb-4 flex items-center justify-between gap-3">
        {notice ? (
          <p role="status" className="rounded-xl bg-emerald-600 px-4 py-2 font-medium text-white">
            {notice}
          </p>
        ) : (
          <span />
        )}
        <button
          onClick={refresh}
          disabled={cooldown.secondsLeft > 0 || status === "loading"}
          className="shrink-0 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:text-slate-400"
        >
          {cooldown.secondsLeft > 0 ? `Refresh in ${cooldown.secondsLeft}s` : "Refresh"}
        </button>
      </div>

      {status === "loading" && (
        <ul className="grid gap-4 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <li key={i} className="space-y-3 rounded-3xl bg-white p-5 shadow-sm">
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
          <p className="text-slate-600">New challenges are on their way. Check back in a moment.</p>
          <button onClick={load} className="mt-2 font-semibold text-emerald-600">
            Try again
          </button>
        </div>
      )}

      {status === "ready" && challenges && (
        <>
          {open.length === 0 && (
            <div className={`${cardClass} mb-4 text-center`}>
              <p className="text-4xl" aria-hidden>
                🎉
              </p>
              <p className="mt-2 text-lg font-semibold">You've cleared your challenges.</p>
              <p className="text-slate-500">New ones show up as your spending changes. Check back later or tap Refresh.</p>
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
