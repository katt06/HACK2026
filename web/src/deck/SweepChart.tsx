import { useRef } from "react";
import { downloadPng, downloadSvg } from "./exportChart";
import type { Interval } from "./LineChart";
import { niceTicks } from "./scale";
import type { ChartPalette } from "./theme";

export interface SweepPanel {
  title: string;
  points: { strength: number; regret: Interval }[];
  independent: Interval; // the textbook baseline, as a reference line
}

const W = 960;
const H = 440;
const TOP = 92;
const BOTTOM = 70;
const FONT = "Nunito, ui-rounded, system-ui, sans-serif";

// Small multiples: one panel per simulated world, regret after a year at each prior strength
// (dot = mean, whisker = 95% CI), with the independent-arms baseline as a dashed reference.
export function SweepChart({
  panels,
  production,
  palette,
  filename,
}: {
  panels: SweepPanel[];
  production: number;
  palette: ChartPalette;
  filename: string;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const panelW = (W - 60) / panels.length;
  const innerH = H - TOP - BOTTOM;
  const ticks = niceTicks(Math.max(...panels.flatMap((p) => [p.independent.hi, ...p.points.map((q) => q.regret.hi)])));
  const yMax = ticks[ticks.length - 1];
  const y = (v: number) => TOP + innerH - (v / yMax) * innerH;

  return (
    <figure className="card overflow-hidden p-0">
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label="Regret after a year at each prior strength, per simulated world" fontFamily={FONT}>
        <rect width={W} height={H} fill={palette.surface} />
        <text x={40} y={36} fill={palette.text} fontSize={24} fontWeight={800}>
          How much should shared evidence count?
        </text>
        <text x={40} y={60} fill={palette.muted} fontSize={15}>
          Missed completions after 52 weeks at each prior strength (lower is better). Dots: mean of 20 seeds; whiskers: 95% CI.
        </text>

        {panels.map((panel, pi) => {
          const left = 40 + pi * panelW + (pi ? 30 : 46);
          const width = panelW - 76;
          const step = width / (panel.points.length - 1);
          const x = (i: number) => left + i * step;
          return (
            <g key={panel.title}>
              <text x={left} y={TOP - 8} fill={palette.text} fontSize={16} fontWeight={800}>
                {panel.title}
              </text>
              {ticks.map((t) => (
                <g key={t}>
                  <line x1={left} x2={left + width} y1={y(t)} y2={y(t)} stroke={palette.grid} />
                  {pi === 0 && (
                    <text x={left - 10} y={y(t)} dy="0.35em" textAnchor="end" fill={palette.muted} fontSize={13}>
                      {t}
                    </text>
                  )}
                </g>
              ))}
              <line x1={left} x2={left + width} y1={y(panel.independent.mean)} y2={y(panel.independent.mean)} stroke={palette.independent} strokeWidth={2} strokeDasharray="6 5" />
              <text x={left + width} y={y(panel.independent.mean) - 8} textAnchor="end" fill={palette.text} fontSize={13} fontWeight={700}>
                Independent arms {panel.independent.mean.toFixed(1)}
              </text>
              {panel.points.map((p, i) => {
                const isProd = p.strength === production;
                return (
                  <g key={p.strength}>
                    <line x1={x(i)} x2={x(i)} y1={y(p.regret.lo)} y2={y(p.regret.hi)} stroke={palette.shared} strokeWidth={2} />
                    <circle cx={x(i)} cy={y(p.regret.mean)} r={isProd ? 7 : 5} fill={palette.shared} stroke={palette.surface} strokeWidth={2} />
                    {isProd && <circle cx={x(i)} cy={y(p.regret.mean)} r={11} fill="none" stroke={palette.text} strokeWidth={1.5} />}
                    <text x={x(i)} y={H - BOTTOM + 22} textAnchor="middle" fill={isProd ? palette.text : palette.muted} fontSize={13} fontWeight={isProd ? 800 : 400}>
                      {p.strength}
                    </text>
                    {isProd && (
                      <text x={x(i)} y={H - BOTTOM + 40} textAnchor="middle" fill={palette.text} fontSize={12} fontWeight={800}>
                        today
                      </text>
                    )}
                  </g>
                );
              })}
            </g>
          );
        })}
        <text x={W / 2} y={H - 8} textAnchor="middle" fill={palette.muted} fontSize={13}>
          Prior strength (virtual attempts of shared evidence)
        </text>
      </svg>
      <figcaption className="flex flex-wrap items-center gap-2 border-t-2 border-line px-4 py-3 text-sm">
        <button onClick={() => svgRef.current && downloadPng(svgRef.current, filename)} className="btn btn-secondary btn-sm">
          Download PNG
        </button>
        <button onClick={() => svgRef.current && downloadSvg(svgRef.current, filename)} className="btn btn-ghost btn-sm">
          SVG
        </button>
      </figcaption>
    </figure>
  );
}
