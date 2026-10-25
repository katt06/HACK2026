import { useState } from "react";
import { Link } from "react-router-dom";
import sim from "../../../scripts/out/banditSimulation.json";
import evalResult from "../../../scripts/out/challengeEval.json";
import { ThemeToggle } from "../components/ThemeToggle";
import { LineChart, type Interval, type Series } from "../deck/LineChart";
import { SweepChart } from "../deck/SweepChart";
import { useChartPalette, type ChartPalette } from "../deck/theme";

// Slide-ready results for A6 (Claude challenges) and A7 (the Thompson sampling picker).
// Data comes from `npm run simulate` and `npm run eval:challenges` (scripts/out/*.json); rerun them and reload.

type World = "structured" | "unstructured";
type PolicyName = "thompsonShared" | "thompsonIndependent" | "epsilonGreedy" | "random" | "oracle";
type PolicyResult = { completion: Interval[]; cumRegret: Interval[] };

const WORLD_LABEL: Record<World, string> = {
  structured: "Tastes follow type and difficulty",
  unstructured: "Every challenge independent",
};

const pct = (x: number) => `${Math.round(x * 100)}%`;
const pct1 = (x: number) => `${(Math.round(x * 1000) / 10).toString()}%`;
const oneDecimal = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));

function policySeries(world: World, metric: "completion" | "cumRegret", palette: ChartPalette): Series[] {
  const policies = sim.worlds[world] as unknown as Record<PolicyName, PolicyResult>;
  const all: Series[] = [
    { key: "shared", label: "Our picker (shared evidence)", short: "Ours", color: palette.shared, points: policies.thompsonShared[metric], band: true },
    { key: "independent", label: "Textbook Thompson", short: "Textbook", color: palette.independent, points: policies.thompsonIndependent[metric], band: true },
    { key: "epsilon", label: "ε-greedy", short: "ε-greedy", color: palette.epsilon, points: policies.epsilonGreedy[metric], band: true },
    { key: "random", label: "Random", short: "Random", color: palette.neutral, points: policies.random[metric], dash: "2 5" },
  ];
  // The oracle's regret is 0 by definition, so it only appears as the ceiling on the completion chart.
  if (metric === "completion") all.push({ key: "oracle", label: "Best possible", short: "Best", color: palette.reference, points: policies.oracle.completion, dash: "8 6" });
  return all;
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="card p-5">
      <p className="text-4xl font-black tracking-tight text-heading lg:text-5xl">{value}</p>
      <p className="mt-1 text-ink-muted">{label}</p>
    </div>
  );
}

function EvalTable() {
  type Metrics = Partial<Record<"guardrailPass" | "groundedReason" | "madeUpNumber" | "personalized" | "crossUserOverlap" | "followsBrief", number | null>> & {
    judge?: { specific: number; doable: number; voice: number } | null;
  };
  const t = evalResult.template as Metrics;
  const c = evalResult.claude as Metrics | null;
  const rows: [string, keyof Metrics, boolean][] = [
    ["Passes the safety guardrails", "guardrailPass", true],
    ["Reason cites a real number from the summary", "groundedReason", true],
    ["Reason cites a number that isn't there", "madeUpNumber", false],
    ["Mentions the user's own spending categories", "personalized", true],
    ["Wording shared between different users", "crossUserOverlap", false],
    ["Follows the brief (4+ types, all difficulties)", "followsBrief", true],
  ];
  const cell = (m: Metrics | null, k: keyof Metrics) => {
    const v = m?.[k];
    return typeof v === "number" ? pct(v) : "–";
  };
  return (
    <div className="card overflow-x-auto p-5">
      <table className="w-full text-left tabular-nums">
        <thead className="text-xs uppercase tracking-wide text-ink-faint">
          <tr>
            <th className="pb-2">Metric (5 seeded personas)</th>
            <th className="pb-2 text-right">Templates</th>
            <th className="pb-2 text-right">Claude</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, key, higherIsBetter]) => (
            <tr key={key} className="border-t border-line">
              <td className="py-2">
                {label} <span className="text-xs text-ink-faint">{higherIsBetter ? "↑ better" : "↓ better"}</span>
              </td>
              <td className="py-2 text-right font-extrabold">{key === "followsBrief" ? "n/a" : cell(t, key)}</td>
              <td className="py-2 text-right font-extrabold">{cell(c, key)}</td>
            </tr>
          ))}
          {c?.judge && (
            <tr className="border-t border-line">
              <td className="py-2">Blind Claude-as-judge (1–5): specific / doable / voice</td>
              <td className="py-2 text-right font-extrabold">{t.judge ? `${t.judge.specific} / ${t.judge.doable} / ${t.judge.voice}` : "–"}</td>
              <td className="py-2 text-right font-extrabold">{`${c.judge.specific} / ${c.judge.doable} / ${c.judge.voice}`}</td>
            </tr>
          )}
        </tbody>
      </table>
      {evalResult.claudeSkipped && (
        <p className="mt-3 rounded-xl bg-warn-soft px-3 py-2 text-sm font-semibold text-warn-ink">
          Claude column pending: add a valid API key to functions/.secret.local and run <code>npm run eval:challenges -- --judge</code>.
        </p>
      )}
    </div>
  );
}

export default function BanditDeck() {
  const palette = useChartPalette();
  const [world, setWorld] = useState<World>("structured");
  const h = sim.headline;
  const c = sim.config;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 lg:px-8 lg:py-12">
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link to="/dashboard" className="text-sm font-semibold text-link">
            ← CapyBalance
          </Link>
          <h1 className="mt-2 text-3xl font-black tracking-tight lg:text-5xl">How the challenge picker learns</h1>
          <p className="mt-2 max-w-3xl text-ink-muted lg:text-lg">
            Thompson sampling over 18 challenge types × difficulties, with evidence shared across related challenges. Simulated: {c.seeds} seeds ×{" "}
            {c.usersPerSeed} users × {c.rounds} weeks, {c.cardsPerRound} cards a week like the app. Bands and whiskers are 95% confidence intervals across seeds.
          </p>
        </div>
        <ThemeToggle />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat value={`−${pct(h.regretCutVsIndependentAt52)}`} label="missed completions vs. textbook Thompson sampling, after a year" />
        <Stat value={`−${pct(h.regretCutVsIndependentAt12)}`} label="after just 12 weeks: it learns faster from little data" />
        <Stat value={`−${pct(h.regretCutVsEpsilonAt52)}`} label="vs. ε-greedy, the usual simple baseline" />
        <Stat
          value={h.unstructuredCostAt52 <= 0 ? "No cost" : `+${pct(h.unstructuredCostAt52)}`}
          label={`when tastes don't follow type or difficulty (${h.unstructuredCostAt52 <= 0 ? `${pct1(-h.unstructuredCostAt52)} better` : "worse"} than textbook)`}
        />
      </div>

      <div role="radiogroup" aria-label="Simulated world" className="mt-8 mb-4 inline-flex rounded-2xl border-2 border-line bg-surface p-1">
        {(Object.keys(WORLD_LABEL) as World[]).map((w) => (
          <button
            key={w}
            role="radio"
            aria-checked={world === w}
            onClick={() => setWorld(w)}
            className={`rounded-xl px-3 py-1.5 text-sm font-extrabold ${world === w ? "bg-primary text-on-primary" : "text-ink-muted hover:text-ink"}`}
          >
            {WORLD_LABEL[w]}
          </button>
        ))}
      </div>

      <div className="space-y-6">
        <LineChart
          title="Missed completions add up slower with our picker"
          subtitle={`Cumulative regret vs. the best possible 3 cards each week · ${WORLD_LABEL[world].toLowerCase()} · lower is better`}
          yLabel="Expected completions missed (per user)"
          series={policySeries(world, "cumRegret", palette)}
          palette={palette}
          format={oneDecimal}
          filename={`bandit-regret-${world}`}
        />
        <LineChart
          title="Share of challenge cards finished each week"
          subtitle={`${WORLD_LABEL[world]} · the dashed line is the best any picker could do`}
          yLabel="Cards finished"
          series={policySeries(world, "completion", palette)}
          palette={palette}
          format={pct}
          filename={`bandit-completion-${world}`}
        />
        <SweepChart
          panels={(["structured", "unstructured"] as World[]).map((w) => ({
            title: WORLD_LABEL[w],
            points: sim.sweep[w].map((p) => ({ strength: p.strength, regret: p.regretAt52 })),
            independent: (sim.worlds[w] as unknown as Record<PolicyName, { summary: { regretAt52: Interval } }>).thompsonIndependent.summary.regretAt52,
          }))}
          production={h.productionStrength}
          palette={palette}
          filename="bandit-prior-strength"
        />
      </div>

      <section className="mt-10">
        <h2 className="text-2xl font-black tracking-tight">What we learned</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-ink lg:text-lg">
          <li>
            When tastes follow type and difficulty, sharing evidence between related challenges beats learning each of the 18 on its own at every prior
            strength we tried, far outside the error bars.
          </li>
          <li>
            It doesn't backfire: when tastes are random, the shared prior is still no worse than the textbook sampler.
          </li>
          <li>
            Stronger sharing kept helping, up to {h.bestStrengthStructured} virtual attempts, the largest we tried. With only 3 cards a week, pooling by type and difficulty matters more than per-challenge history.
            Caveat: our simulated users have little type × difficulty interaction, so a very strong prior could miss quirks like "loves easy cooking,
            hates hard cooking". We use {h.productionStrength} today.
          </li>
        </ul>
      </section>

      <section className="mt-10 mb-6">
        <h2 className="text-2xl font-black tracking-tight">Claude vs. templates (A6)</h2>
        <p className="mt-1 mb-3 text-ink-muted">Same inputs as production: aggregated spending only, plus what the picker has learned. No merchant names ever reach the model.</p>
        <EvalTable />
      </section>
    </div>
  );
}
