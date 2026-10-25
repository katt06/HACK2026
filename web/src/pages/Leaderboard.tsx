import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { GetLeaderboardResponse, GroupSummary, LeaderboardEntry } from "@contract";
import { api } from "../api";
import { PageHeader } from "../components/AppLayout";
import { cardClass } from "../components/forms";
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
    <div className="mb-4 rounded-2xl bg-emerald-50 px-4 py-3 text-emerald-900 lg:px-6 lg:py-4">
      <p className="font-medium lg:text-lg">Scores are based on your own goal, so income doesn't matter.</p>
      <button onClick={() => setOpen(!open)} aria-expanded={open} className="mt-1 text-sm font-semibold text-emerald-700">
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
          <li className="text-emerald-700">No dollar amounts are ever shared with your group.</li>
        </ul>
      )}
    </div>
  );
}

function RankChange({ delta }: { delta: number }) {
  if (!delta) return null;
  const up = delta > 0;
  return (
    <span className={`rounded-full px-1.5 text-xs font-bold ${up ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
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
      className={`relative grid grid-cols-[2rem_1fr_auto] items-center gap-x-3 gap-y-1 rounded-2xl p-4 shadow-sm ${COLUMNS} lg:gap-x-4 lg:px-6 lg:py-5 lg:text-lg ${
        entry.isMe ? "z-10 bg-emerald-50 ring-2 ring-emerald-500" : "bg-white"
      }`}
    >
      <span className="text-center text-2xl font-bold text-slate-400 lg:text-3xl">{entry.rank}</span>
      <span className="flex min-w-0 items-center gap-2">
        <span className="truncate font-semibold">{entry.displayName}</span>
        {entry.isMe && <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-xs font-semibold text-white">You</span>}
        <RankChange delta={delta} />
      </span>

      {/* Phones: level on the right of the name line, stats on a second line. Large screens: one column each. */}
      <span className="text-right lg:order-last">
        <span className="block font-bold">Lv {entry.level}</span>
        <span className="block text-xs text-slate-500 lg:text-sm">{entry.points} pts</span>
      </span>
      <div className="col-span-2 col-start-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500 lg:contents lg:text-base lg:text-slate-700">
        <span className="flex items-center gap-2">
          <span className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-200 lg:h-2 lg:w-full">
            <span className="block h-full rounded-full bg-emerald-500" style={{ width: `${Math.min(100, entry.goalProgressPct)}%` }} />
          </span>
          <span className="tabular-nums">{entry.goalProgressPct}%</span>
        </span>
        <span className="whitespace-nowrap">
          <span aria-hidden>🔥</span> {entry.streak}
          <span className="text-slate-500"> wk</span>
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
    <div className={`hidden gap-x-4 px-6 pb-2 text-sm font-semibold uppercase tracking-wide text-slate-400 lg:grid ${COLUMNS}`}>
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
        <li key={i} className="flex items-center gap-4 rounded-2xl bg-white p-4 shadow-sm">
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
            className="mt-1 shrink-0 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
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
              className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-semibold ${g.id === groupId ? "bg-slate-900 text-white" : "bg-white text-slate-600 shadow-sm"}`}
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
          <p className="text-slate-600">The leaderboard is taking a breather. Scores are safe.</p>
          <button onClick={retry} className="mt-2 font-semibold text-emerald-600">
            Try again
          </button>
        </div>
      )}

      {status === "ready" && groups?.length === 0 && (
        <div className={cardClass}>
          <p className="text-slate-600">Join or start a group to see how you stack up with friends.</p>
          <Link to="/group" className="mt-3 inline-block rounded-xl bg-emerald-600 px-4 py-2 font-semibold text-white">
            Go to groups
          </Link>
        </div>
      )}

      {status === "ready" && data && (
        <>
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
