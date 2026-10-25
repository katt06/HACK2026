import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import type { SafeToSaveHistoryPoint } from "@contract";
import { formatCents, formatDate } from "../lib/format";

const HEIGHT = 170;
const M = { top: 12, right: 12, bottom: 24, left: 48 };

// Round up to 1, 2, or 5 × 10^k dollars so axis labels are clean.
function niceMaxCents(cents: number): number {
  const dollars = Math.max(cents / 100, 10);
  const step = 10 ** Math.floor(Math.log10(dollars));
  const nice = [1, 2, 5, 10].map((m) => m * step).find((v) => v >= dollars) ?? dollars;
  return nice * 100;
}

const shortDate = (iso: string) => formatDate(iso).split(", ").slice(1).join(", ") || formatDate(iso);
const axisDollars = (cents: number) => `$${Math.round(cents / 100).toLocaleString("en-US")}`;

// Single-series area chart of the left-over amount, with a crosshair tooltip (mouse, touch, or arrow keys)
// and a table view. Balance is shown in the tooltip rather than as a second line on a different scale.
export function TrackRecordChart({ points }: { points: SafeToSaveHistoryPoint[] }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  const [active, setActive] = useState<number | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(240, entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (points.length < 2) return null;

  const n = points.length;
  const innerW = width - M.left - M.right;
  const innerH = HEIGHT - M.top - M.bottom;
  const yMax = niceMaxCents(Math.max(...points.map((p) => p.amount)));
  const x = (i: number) => M.left + (i * innerW) / (n - 1);
  const y = (cents: number) => M.top + innerH - (cents / yMax) * innerH;
  const baseline = y(0);

  const line = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.amount).toFixed(1)}`).join("");
  const area = `${line}L${x(n - 1).toFixed(1)},${baseline}L${x(0).toFixed(1)},${baseline}Z`;
  const ticks = [0, yMax / 2, yMax];
  const xLabels = [0, Math.floor((n - 1) / 2), n - 1];

  const first = points[0];
  const last = points[n - 1];
  const high = points.reduce((a, b) => (b.amount > a.amount ? b : a));
  const summary = `Left over each day for the last ${n} days: ${formatCents(first.amount)} on ${formatDate(first.date)}, ${formatCents(last.amount)} today. Highest was ${formatCents(high.amount)} on ${formatDate(high.date)}.`;

  const indexAt = (clientX: number) => {
    const rect = wrapRef.current!.getBoundingClientRect();
    const i = Math.round(((clientX - rect.left - M.left) / innerW) * (n - 1));
    return Math.min(n - 1, Math.max(0, i));
  };

  const onKey = (e: KeyboardEvent) => {
    const moves: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, Home: -n, End: n };
    if (!(e.key in moves)) return;
    e.preventDefault();
    setActive((i) => Math.min(n - 1, Math.max(0, (i ?? n - 1) + moves[e.key])));
  };

  const shown = active !== null ? points[active] : null;
  const tipLeft = active !== null ? Math.min(Math.max(x(active), 80), width - 80) : 0;

  return (
    <div>
      <div
        ref={wrapRef}
        className="relative touch-pan-y outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 rounded-lg"
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
          {ticks.map((t) => (
            <g key={t}>
              <line x1={M.left} x2={width - M.right} y1={y(t)} y2={y(t)} className="stroke-slate-200" strokeWidth={1} />
              <text x={M.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-slate-500 text-[11px] tabular-nums">
                {axisDollars(t)}
              </text>
            </g>
          ))}
          {xLabels.map((i) => (
            <text key={i} x={x(i)} y={HEIGHT - 6} textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"} className="fill-slate-500 text-[11px]">
              {i === n - 1 ? "Today" : shortDate(points[i].date)}
            </text>
          ))}
          <path d={area} className="fill-emerald-600" fillOpacity={0.1} />
          <path d={line} fill="none" className="stroke-emerald-600" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {active !== null && (
            <line x1={x(active)} x2={x(active)} y1={M.top} y2={baseline} className="stroke-slate-400" strokeWidth={1} />
          )}
          <circle
            cx={x(active ?? n - 1)}
            cy={y(points[active ?? n - 1].amount)}
            r={4}
            className="fill-emerald-600 stroke-white"
            strokeWidth={2}
          />
        </svg>

        {shown && (
          <div
            className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-xl bg-slate-900 px-3 py-2 text-xs text-slate-300 shadow-lg"
            style={{ left: tipLeft }}
          >
            <p className="text-base font-bold text-white">{formatCents(shown.amount)}</p>
            <p className="flex items-center gap-1.5">
              <span aria-hidden className="inline-block h-0.5 w-3 rounded bg-emerald-400" />
              Left over · {active === n - 1 ? "Today" : formatDate(shown.date)}
            </p>
            <p>Balance {formatCents(shown.balance)}</p>
          </div>
        )}
      </div>

      <details className="mt-2 text-sm text-slate-500">
        <summary className="cursor-pointer font-medium">View as table</summary>
        <div className="mt-2 max-h-48 overflow-y-auto">
          <table className="w-full text-left tabular-nums">
            <thead className="sticky top-0 bg-white text-xs uppercase text-slate-400">
              <tr>
                <th className="py-1 font-semibold">Date</th>
                <th className="py-1 text-right font-semibold">Left over</th>
                <th className="py-1 text-right font-semibold">Balance</th>
              </tr>
            </thead>
            <tbody className="text-slate-700">
              {[...points].reverse().map((p) => (
                <tr key={p.date} className="border-t border-slate-100">
                  <td className="py-1">{formatDate(p.date)}</td>
                  <td className="py-1 text-right">{formatCents(p.amount)}</td>
                  <td className="py-1 text-right">{formatCents(p.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
