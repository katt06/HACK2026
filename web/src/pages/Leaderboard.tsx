import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { GetLeaderboardResponse, GroupSummary, LeaderboardEntry } from "@contract";
import { api } from "../api";
import { PageHeader } from "../components/AppLayout";
import { cardClass } from "../components/forms";
import { EmptyState } from "../components/EmptyState";
import { HerdChart } from "../components/HerdChart";
import { ProgressBar } from "../components/ProgressBar";
import { Skeleton } from "../components/Skeleton";

const PREFERRED_GROUP = "demo-group";
const ranksKey = (groupId: string) => `leaderboard.ranks.${groupId}`;

function loadRanks(groupId: string): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(ranksKey(groupId)) ?? "{}");
  } catch {
    return {};
  }
}

function saveRanks(groupId: string, entries: LeaderboardEntry[]) {
  try {
    localStorage.setItem(ranksKey(groupId), JSON.stringify(Object.fromEntries(entries.map((e) => [e.userId, e.rank]))));
  } catch {
    // Storage unavailable: ranks just won't animate across visits.
  }
}

// Mirrors the server's ranking in functions/src/logic/scoring.ts.
function Explainer() {
  const [open, setOpen] = useState(false);
  return (
    <div className="mb-4 rounded-2xl border-2 border-mint bg-primary-soft px-4 py-3 text-heading lg:px-6 lg:py-4">
      <p className="font-medium lg:text-lg">Scores are based on your own goal, so income doesn't matter.</p>
      <button onClick={() => setOpen(!open)} aria-expanded={open} className="mt-1 text-sm font-semibold text-link">
        {open ? "Hide" : "How scores work"}
      </button>
      {open && (
        <ul className="mt-2 space-y-1 text-sm lg:text-base">
          <li>
            <strong>Points</strong> for challenges and for progress toward your goal (verified progress counts 1.5×)
          </li>
          <li>
            <strong>+ Improvement</strong>: how much less you're spending on extras than usual (0–100)
          </li>
          <li>
            <strong>+ 10 per streak week</strong>: every week in a row you hit your savings target
          </li>
          <li className="text-link">No dollar amounts are ever shared with your group.</li>
        </ul>
      )}
    </div>
  );
}

function RankChange({ delta }: { delta: number }) {
  if (!delta) return null;
  const up = delta > 0;
  return (
    <span className={`rounded-full px-1.5 text-xs font-extrabold ${up ? "bg-primary-soft text-link" : "bg-danger-soft text-danger"}`}>
      {up ? "▲" : "▼"}
      {Math.abs(delta)}
    </span>
  );
}

const COLUMNS = "lg:grid-cols-[3rem_1.6fr_1.6fr_6rem_8rem_8rem]";

function Row({ entry, delta, rowRef }: { entry: LeaderboardEntry; delta: number; rowRef: (el: HTMLLIElement | null) => void }) {
  const weeks = entry.streak === 1 ? "week" : "weeks";
  return (
    <li
      ref={rowRef}
      className={`relative grid grid-cols-[2rem_1fr_auto] items-center gap-x-3 gap-y-1 rounded-2xl border-2 p-4 ${COLUMNS} lg:gap-x-4 lg:px-6 lg:py-5 lg:text-lg ${
        entry.isMe ? "z-10 border-leaf bg-primary-soft" : "border-line bg-surface"
      }`}
    >
      <span className="text-center text-2xl font-extrabold text-ink-faint lg:text-3xl">{entry.rank}</span>
      <span className="flex min-w-0 items-center gap-2">
        <span className="truncate font-semibold">{entry.displayName}</span>
        {entry.isMe && <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-extrabold text-on-primary">You</span>}
        <RankChange delta={delta} />
      </span>

      {/* Phones: level on the right of the name line, stats on a second line. Large screens: one column each. */}
      <span className="text-right lg:order-last">
        <span className="block font-extrabold">Lv {entry.level}</span>
        <span className="block text-xs text-ink-muted lg:text-sm">{entry.points} XP</span>
      </span>
      <div className="col-span-2 col-start-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-muted lg:contents lg:text-base lg:text-ink">
        <span className="flex items-center gap-2">
          <span className="w-20 lg:w-full">
            <ProgressBar pct={entry.goalProgressPct} size="sm" label={`${entry.displayName}'s goal progress`} />
          </span>
          <span className="tabular-nums">{entry.goalProgressPct}%</span>
        </span>
        <span className="whitespace-nowrap">
          <span aria-hidden>🔥</span> {entry.streak}
          <span className="text-ink-muted"> wk</span>
          <span className="sr-only"> {weeks} streak</span>
        </span>
        <span className="whitespace-nowrap">
          <span className="lg:hidden">Improvement </span>
          <span className="tabular-nums">{entry.improvementScore}</span>
        </span>
      </div>
    </li>
  );
}

function ColumnHeaders() {
  return (
    <div className={`hidden gap-x-4 px-6 pb-2 text-sm font-semibold uppercase tracking-wide text-ink-faint lg:grid ${COLUMNS}`}>
      <span className="text-center">#</span>
      <span>Name</span>
      <span>Goal progress</span>
      <span>Streak</span>
      <span>Improvement</span>
      <span className="text-right">Level</span>
    </div>
  );
}

function SkeletonRows() {
  return (
    <ol className="space-y-2">
      {[0, 1, 2, 3].map((i) => (
        <li key={i} className="card flex items-center gap-4 p-4">
          <Skeleton className="h-6 w-6" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-5 w-1/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
          <Skeleton className="h-8 w-10" />
        </li>
      ))}
    </ol>
  );
}

export default function Leaderboard() {
  const [groups, setGroups] = useState<GroupSummary[] | null>(null);
  const [groupId, setGroupId] = useState<string | null>(null);
  const [data, setData] = useState<GetLeaderboardResponse | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");
  const [refreshing, setRefreshing] = useState(false);
  const [deltas, setDeltas] = useState<Record<string, number>>({});

  const rows = useRef(new Map<string, HTMLLIElement>());
  const previousRanks = useRef<Record<string, number>>({});
  const pendingAnimation = useRef(false);

  // Pick a group: the demo group if I'm in it, else my first one.
  useEffect(() => {
    api
      .getMyGroups()
      .then((gs) => {
        setGroups(gs);
        setGroupId((gs.find((g) => g.id === PREFERRED_GROUP) ?? gs[0])?.id ?? null);
        if (gs.length === 0) setStatus("ready");
      })
      .catch(() => setStatus("failed"));
  }, []);

  const load = useCallback((id: string) => {
    api.getLeaderboard(id).then(
      (res) => {
        const before = previousRanks.current;
        const changes = Object.fromEntries(
          res.entries.filter((e) => before[e.userId] && before[e.userId] !== e.rank).map((e) => [e.userId, before[e.userId] - e.rank]),
        );
        pendingAnimation.current = Object.keys(changes).length > 0;
        setDeltas(changes);
        setData(res);
        setStatus("ready");
        setRefreshing(false);
        saveRanks(id, res.entries);
        if (pendingAnimation.current) setTimeout(() => setDeltas({}), 4000);
      },
      (err) => {
        console.error(err);
        setRefreshing(false);
        setStatus((s) => (s === "ready" ? s : "failed"));
      },
    );
  }, []);

  useEffect(() => {
    if (!groupId) return;
    previousRanks.current = loadRanks(groupId);
    setData(null);
    setStatus("loading");
    load(groupId);
  }, [groupId, load]);

  // FLIP: start each moved row at its old position, then slide to the new one.
  useLayoutEffect(() => {
    if (!data || !pendingAnimation.current) return;
    pendingAnimation.current = false;
    previousRanks.current = Object.fromEntries(data.entries.map((e) => [e.userId, e.rank]));
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const els = data.entries.map((e) => rows.current.get(e.userId)).filter((el): el is HTMLLIElement => !!el);
    if (els.length < 2) return;
    const pitch = els[1].offsetTop - els[0].offsetTop;
    for (const entry of data.entries) {
      const el = rows.current.get(entry.userId);
      const delta = deltas[entry.userId];
      if (!el || !delta) continue;
      el.style.transition = "none";
      el.style.transform = `translateY(${delta * pitch}px)`;
    }
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        for (const el of els) {
          el.style.transition = "transform 900ms cubic-bezier(0.22, 1, 0.36, 1)";
          el.style.transform = "";
        }
      }),
    );
  }, [data, deltas]);

  const refresh = () => {
    if (!groupId) return;
    previousRanks.current = data ? Object.fromEntries(data.entries.map((e) => [e.userId, e.rank])) : previousRanks.current;
    setRefreshing(true);
    load(groupId);
  };

  const retry = () => {
    setStatus("loading");
    if (groupId) load(groupId);
    else window.location.reload();
  };

  return (
    <>
      <div className="flex items-start justify-between gap-4">
        <PageHeader title="Leaderboard" subtitle={data?.group.name} />
        {data && (
          <button
            onClick={refresh}
            disabled={refreshing}
            className="btn btn-secondary btn-sm mt-1 shrink-0"
          >
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
        )}
      </div>

      {groups && groups.length > 1 && (
        <div className="-mt-2 mb-4 flex gap-2 overflow-x-auto pb-1">
          {groups.map((g) => (
            <button
              key={g.id}
              onClick={() => setGroupId(g.id)}
              className={`shrink-0 rounded-full border-2 px-4 py-1.5 text-sm font-extrabold ${g.id === groupId ? "border-primary bg-primary text-on-primary" : "border-line bg-surface text-ink-muted"}`}
            >
              {g.name}
            </button>
          ))}
        </div>
      )}

      <Explainer />

      {status === "loading" && <SkeletonRows />}

      {status === "failed" && (
        <div className={`${cardClass} text-center`}>
          <p className="text-ink-muted">The leaderboard is taking a breather. Scores are safe.</p>
          <button onClick={retry} className="mt-2 font-semibold text-link">
            Try again
          </button>
        </div>
      )}

      {status === "ready" && groups?.length === 0 && (
        <EmptyState
          mascot="coin"
          title="No herd yet"
          action={
            <Link to="/group" className="btn btn-primary">
              Go to groups
            </Link>
          }
        >
          Join or start a group to see how everyone's doing.
        </EmptyState>
      )}

      {status === "ready" && data && (
        <>
          <section className={`${cardClass} mb-6`}>
            <h2 className="mb-1 text-lg font-extrabold">Herd progress</h2>
            <p className="mb-3 text-sm text-ink-muted">How far everyone is toward their own goal, and their weekly streaks.</p>
            <HerdChart entries={data.entries} />
          </section>
          <h2 className="mb-2 text-lg font-extrabold">Rankings</h2>
          <ColumnHeaders />
          <ol className="space-y-2">
            {data.entries.map((e) => (
              <Row
                key={e.userId}
                entry={e}
                delta={deltas[e.userId] ?? 0}
                rowRef={(el) => {
                  if (el) rows.current.set(e.userId, el);
                  else rows.current.delete(e.userId);
                }}
              />
            ))}
          </ol>
        </>
      )}
    </>
  );
}
