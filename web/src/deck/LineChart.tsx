import { useRef, useState, type PointerEvent, type ReactElement } from "react";
import { downloadPng, downloadSvg } from "./exportChart";
import { bandPath, linePath, niceTicks } from "./scale";
import type { ChartPalette } from "./theme";

export interface Interval {
  mean: number;
  lo: number;
  hi: number;
}

export interface Series {
  key: string;
  label: string;
  short: string; // end-of-line label
  color: string;
  points: Interval[]; // one per week
  dash?: string; // neutral references are dashed or dotted, so identity is never color alone
  band?: boolean; // draw the 95% CI band
}

const W = 960;
const H = 500;
const M = { top: 96, right: 170, bottom: 58, left: 76 };
const FONT = "Nunito, ui-rounded, system-ui, sans-serif";

// Weekly lines with 95% CI bands, a legend and direct end labels, all inside the SVG so an export is
// self-contained. Hover (or arrow keys) shows a crosshair and every series' value for that week.
export function LineChart({
  title,
  subtitle,
  yLabel,
  series,
  palette,
  format,
  filename,
}: {
  title: string;
  subtitle: string;
  yLabel: string;
  series: Series[];
  palette: ChartPalette;
  format: (v: number) => string;
  filename: string;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [active, setActive] = useState<number | null>(null);
  const n = series[0].points.length;
  const innerW = W - M.left - M.right;
  const innerH = H - M.top - M.bottom;
  const ticks = niceTicks(Math.max(...series.flatMap((s) => s.points.map((p) => p.hi))));
  const yMax = ticks[ticks.length - 1];
  const x = (i: number) => M.left + (i / (n - 1)) * innerW;
  const y = (v: number) => M.top + innerH - (v / yMax) * innerH;
  const xTicks = [0, 12, 25, 38, 51].filter((i) => i < n);

  // End labels, nudged apart so they never overlap.
  const labels = series
    .map((s) => ({ s, y: y(s.points[n - 1].mean) }))
    .sort((a, b) => a.y - b.y)
    .reduce<{ s: Series; y: number }[]>((placed, l) => [...placed, { ...l, y: Math.max(l.y, (placed.at(-1)?.y ?? -Infinity) + 20) }], []);

  const indexAt = (e: PointerEvent) => {
    const rect = svgRef.current!.getBoundingClientRect();
    const vx = ((e.clientX - rect.left) / rect.width) * W;
    return Math.min(n - 1, Math.max(0, Math.round(((vx - M.left) / innerW) * (n - 1))));
  };

  const tipLeftPct = active !== null ? (Math.min(Math.max(x(active), 160), W - 220) / W) * 100 : 0;

  return (
    <figure className="card overflow-hidden p-0">
      <div className="relative">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="block h-auto w-full touch-pan-y outline-none focus-visible:ring-2 focus-visible:ring-leaf"
          role="img"
          aria-label={`${title}. ${subtitle}`}
          tabIndex={0}
          onPointerMove={(e) => setActive(indexAt(e))}
          onPointerDown={(e) => setActive(indexAt(e))}
          onPointerLeave={() => setActive(null)}
          onBlur={() => setActive(null)}
          onKeyDown={(e) => {
            const step = { ArrowLeft: -1, ArrowRight: 1 }[e.key];
            if (!step) return;
            e.preventDefault();
            setActive((i) => Math.min(n - 1, Math.max(0, (i ?? n - 1) + step)));
          }}
          fontFamily={FONT}
        >
          <rect width={W} height={H} fill={palette.surface} />
          <text x={M.left} y={36} fill={palette.text} fontSize={24} fontWeight={800}>
            {title}
          </text>
          <text x={M.left} y={60} fill={palette.muted} fontSize={15}>
            {subtitle}
          </text>

          {/* legend */}
          <g transform={`translate(${M.left} 80)`}>
            {series.reduce<{ el: ReactElement[]; x: number }>(
              (acc, s) => {
                acc.el.push(
                  <g key={s.key} transform={`translate(${acc.x} 0)`}>
                    <line x1={0} x2={22} y1={0} y2={0} stroke={s.color} strokeWidth={3} strokeDasharray={s.dash} strokeLinecap="round" />
                    <text x={28} y={0} dy="0.35em" fill={palette.text} fontSize={14}>
                      {s.label}
                    </text>
                  </g>,
                );
                acc.x += 48 + s.label.length * 8.2;
                return acc;
              },
              { el: [], x: 0 },
            ).el}
          </g>

          {/* grid and axes */}
          {ticks.map((t) => (
            <g key={t}>
              <line x1={M.left} x2={W - M.right} y1={y(t)} y2={y(t)} stroke={palette.grid} strokeWidth={1} />
              <text x={M.left - 10} y={y(t)} dy="0.35em" textAnchor="end" fill={palette.muted} fontSize={13}>
                {format(t)}
              </text>
            </g>
          ))}
          {xTicks.map((i) => (
            <text key={i} x={x(i)} y={H - M.bottom + 24} textAnchor="middle" fill={palette.muted} fontSize={13}>
              Week {i + 1}
            </text>
          ))}
          <text x={M.left + innerW / 2} y={H - 10} textAnchor="middle" fill={palette.muted} fontSize={13}>
            Weeks of challenges (3 cards a week)
          </text>
          <text transform={`translate(18 ${M.top + innerH / 2}) rotate(-90)`} textAnchor="middle" fill={palette.muted} fontSize={13}>
            {yLabel}
          </text>

          {/* CI bands under lines */}
          {series
            .filter((s) => s.band)
            .map((s) => (
              <path
                key={`${s.key}-band`}
                d={bandPath(
                  s.points.map((p, i) => [x(i), y(p.hi)]),
                  s.points.map((p, i) => [x(i), y(p.lo)]),
                )}
                fill={s.color}
                opacity={0.16}
              />
            ))}
          {series.map((s) => (
            <path
              key={s.key}
              d={linePath(s.points.map((p, i) => [x(i), y(p.mean)]))}
              fill="none"
              stroke={s.color}
              strokeWidth={s.dash ? 2 : 2.5}
              strokeDasharray={s.dash}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ))}
          {labels.map(({ s, y: ly }) => (
            <g key={`${s.key}-label`}>
              <circle cx={x(n - 1)} cy={y(s.points[n - 1].mean)} r={4} fill={s.color} stroke={palette.surface} strokeWidth={2} />
              <text x={x(n - 1) + 12} y={ly} dy="0.35em" fill={palette.text} fontSize={14} fontWeight={700}>
                {s.short} {format(s.points[n - 1].mean)}
              </text>
            </g>
          ))}

          {active !== null && (
            <g data-export-hide>
              <line x1={x(active)} x2={x(active)} y1={M.top} y2={M.top + innerH} stroke={palette.muted} strokeWidth={1} />
              {series.map((s) => (
                <circle key={s.key} cx={x(active)} cy={y(s.points[active].mean)} r={5} fill={s.color} stroke={palette.surface} strokeWidth={2} />
              ))}
            </g>
          )}
        </svg>

        {active !== null && (
          <div
            className="pointer-events-none absolute top-[22%] z-10 w-max -translate-x-1/2 rounded-xl bg-forest px-3 py-2 text-xs text-white/85 shadow-lg"
            style={{ left: `${tipLeftPct}%` }}
          >
            <p className="mb-1 font-extrabold text-white">Week {active + 1}</p>
            {series.map((s) => (
              <p key={s.key} className="flex items-center gap-2 tabular-nums">
                <span className="inline-block h-0.5 w-3 rounded" style={{ background: s.color }} />
                <span>{s.label}</span>
                <span className="ml-auto pl-3 font-bold text-white">{format(s.points[active].mean)}</span>
                <span className="text-white/60">
                  ({format(s.points[active].lo)}–{format(s.points[active].hi)})
                </span>
              </p>
            ))}
          </div>
        )}
      </div>

      <figcaption className="flex flex-wrap items-center gap-2 border-t-2 border-line px-4 py-3 text-sm">
        <button onClick={() => svgRef.current && downloadPng(svgRef.current, filename)} className="btn btn-secondary btn-sm">
          Download PNG
        </button>
        <button onClick={() => svgRef.current && downloadSvg(svgRef.current, filename)} className="btn btn-ghost btn-sm">
          SVG
        </button>
        <details className="ml-auto text-ink-muted">
          <summary className="cursor-pointer font-semibold">View as table</summary>
          <table className="mt-2 w-full text-left tabular-nums">
            <thead className="text-xs uppercase text-ink-faint">
              <tr>
                <th className="py-1 pr-4">Series</th>
                {xTicks.map((i) => (
                  <th key={i} className="py-1 pr-4 text-right">
                    Wk {i + 1}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="text-ink">
              {series.map((s) => (
                <tr key={s.key} className="border-t border-line">
                  <td className="py-1 pr-4">{s.label}</td>
                  {xTicks.map((i) => (
                    <td key={i} className="py-1 pr-4 text-right">
                      {format(s.points[i].mean)} <span className="text-ink-faint">±{format((s.points[i].hi - s.points[i].lo) / 2)}</span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </figcaption>
    </figure>
  );
}
