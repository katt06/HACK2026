import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import type { GoalDoc, GoalEntryDoc } from "@contract";
import { daysBetween, todayIso } from "../lib/dates";
import { formatCents, formatDate } from "../lib/format";
import { goalTimeline, paceOn } from "../lib/goalTimeline";

const HEIGHT = 190;
const M = { top: 16, right: 16, bottom: 26, left: 52 };

const shortDate = (iso: string) => formatDate(iso).split(", ").slice(1).join(", ") || formatDate(iso);
const axisDollars = (cents: number) => `$${Math.round(cents / 100).toLocaleString("en-US")}`;

// Saved-so-far over time (a step line, since money arrives in chunks) against a dashed "steady pace" line
// from $0 at the start to the target at the deadline. Crosshair tooltip snaps to each contribution day
// (mouse, touch, or arrow keys); the Activity list below the chart is the table view.
export function GoalTimelineChart({ goal, entries }: { goal: GoalDoc; entries: GoalEntryDoc[] }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  const [active, setActive] = useState<number | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(260, entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const today = todayIso();
  const { start, end, points, expenses } = goalTimeline(goal, entries, today);
  const span = Math.max(1, daysBetween(start, end));
  const innerW = width - M.left - M.right;
  const innerH = HEIGHT - M.top - M.bottom;
  const yMax = Math.max(goal.targetAmount, ...points.map((p) => p.saved)) || 1;
  const x = (date: string) => M.left + (Math.min(span, Math.max(0, daysBetween(start, date))) / span) * innerW;
  const y = (cents: number) => M.top + innerH - (cents / yMax) * innerH;
  const baseline = y(0);
  const pace = (date: string) => paceOn(date, start, goal.deadline, goal.targetAmount);

  // Step-after: flat until the next contribution, then up.
  const line = points.map((p, i) => (i ? `H${x(p.date).toFixed(1)}V${y(p.saved).toFixed(1)}` : `M${x(p.date).toFixed(1)},${y(p.saved).toFixed(1)}`)).join("");
  const last = points[points.length - 1];
  const area = `${line}V${baseline}H${x(points[0].date).toFixed(1)}Z`;
  const deposits = points.map((p, i) => ({ p, i })).filter(({ p }) => p.added > 0);

  const n = points.length;
  const summary = `Saved ${formatCents(last.saved)} of ${formatCents(goal.targetAmount)} since ${formatDate(start)}. A steady pace would be at ${formatCents(pace(today))} today.`;

  const indexAt = (clientX: number) => {
    const rect = wrapRef.current!.getBoundingClientRect();
    const px = clientX - rect.left;
    return points.reduce((best, p, i) => (Math.abs(x(p.date) - px) < Math.abs(x(points[best].date) - px) ? i : best), 0);
  };

  const onKey = (e: KeyboardEvent) => {
    const moves: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, Home: -n, End: n };
    if (!(e.key in moves)) return;
    e.preventDefault();
    setActive((i) => Math.min(n - 1, Math.max(0, (i ?? n - 1) + moves[e.key])));
  };

  const shown = active !== null ? points[active] : null;
  const tipLeft = shown ? Math.min(Math.max(x(shown.date), 90), width - 90) : 0;
  const todayX = x(today);

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-muted">
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="inline-block h-0.5 w-4 rounded bg-leaf" />
          Saved
        </span>
        <span className="flex items-center gap-1.5">
          <svg width="16" height="2" aria-hidden>
            <line x1="0" x2="16" y1="1" y2="1" className="stroke-ink-faint" strokeWidth={2} strokeDasharray="4 3" />
          </svg>
          Steady pace
        </span>
        {expenses.length > 0 && (
          <span className="flex items-center gap-1.5">
            <span aria-hidden className="inline-block h-2.5 w-2.5 rotate-45 rounded-[2px] bg-blush" />
            Unexpected expense
          </span>
        )}
      </div>

      <div
        ref={wrapRef}
        className="relative touch-pan-y rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-leaf"
        tabIndex={0}
        role="img"
        aria-label={summary}
        onPointerMove={(e: PointerEvent) => setActive(indexAt(e.clientX))}
        onPointerDown={(e: PointerEvent) => setActive(indexAt(e.clientX))}
        onPointerLeave={() => setActive(null)}
        onFocus={() => setActive(n - 1)}
        onBlur={() => setActive(null)}
        onKeyDown={onKey}
      >
        <svg width={width} height={HEIGHT} className="block" aria-hidden>
          {[0, yMax / 2, yMax].map((t) => (
            <g key={t}>
              <line x1={M.left} x2={width - M.right} y1={y(t)} y2={y(t)} className="stroke-line" strokeWidth={1} />
              <text x={M.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-ink-muted text-[11px] tabular-nums">
                {axisDollars(t)}
              </text>
            </g>
          ))}
          <text x={width - M.right} y={y(goal.targetAmount) - 5} textAnchor="end" className="fill-ink-muted text-[11px] font-bold">
            Goal
          </text>

          <text x={M.left} y={HEIGHT - 6} className="fill-ink-muted text-[11px]">
            {shortDate(start)}
          </text>
          <text x={width - M.right} y={HEIGHT - 6} textAnchor="end" className="fill-ink-muted text-[11px]">
            {end === goal.deadline ? `Due ${shortDate(end)}` : "Today"}
          </text>

          <line x1={x(start)} y1={baseline} x2={x(goal.deadline)} y2={y(goal.targetAmount)} className="stroke-ink-faint" strokeWidth={2} strokeDasharray="5 4" />

          {end !== today && todayX - M.left > 40 && todayX < width - M.right - 50 && (
            <g>
              <line x1={todayX} x2={todayX} y1={M.top} y2={baseline} className="stroke-line" strokeWidth={1} strokeDasharray="2 3" />
              <text x={todayX} y={HEIGHT - 6} textAnchor="middle" className="fill-ink-muted text-[11px]">
                Today
              </text>
            </g>
          )}

          <path d={area} className="fill-leaf" fillOpacity={0.12} />
          <path d={line} fill="none" className="stroke-leaf" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />

          {expenses.map((ex, i) => (
            <rect
              key={i}
              x={x(ex.date) - 5}
              y={baseline - 5}
              width={10}
              height={10}
              rx={2}
              transform={`rotate(45 ${x(ex.date)} ${baseline})`}
              className="fill-blush stroke-surface"
              strokeWidth={2}
            />
          ))}

          {active !== null && <line x1={x(points[active].date)} x2={x(points[active].date)} y1={M.top} y2={baseline} className="stroke-ink-faint" strokeWidth={1} />}

          {deposits.map(({ p, i }) => (
            <circle key={p.date} cx={x(p.date)} cy={y(p.saved)} r={active === i ? 6 : 4.5} className="fill-leaf stroke-surface" strokeWidth={2} />
          ))}
        </svg>

        {shown && (
          <div
            className="pointer-events-none absolute top-0 z-10 w-max max-w-52 -translate-x-1/2 rounded-xl bg-forest px-3 py-2 text-xs text-white/80 shadow-lg"
            style={{ left: tipLeft }}
          >
            <p className="font-bold text-white/70">{shown.date === today ? "Today" : formatDate(shown.date)}</p>
            <p className="text-base font-extrabold text-white">{formatCents(shown.saved)} saved</p>
            {shown.added > 0 && <p className="text-mint">+{formatCents(shown.added)} added</p>}
            {shown.notes.map((note) => (
              <p key={note} className="truncate italic">
                "{note}"
              </p>
            ))}
            <p className="mt-0.5">Steady pace: {formatCents(pace(shown.date))}</p>
          </div>
        )}
      </div>
    </div>
  );
}
