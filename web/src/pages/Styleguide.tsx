import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Button, type ButtonVariant } from "../components/Button";
import { Difficulty } from "../components/Difficulty";
import { EmptyState } from "../components/EmptyState";
import { LogoBadge, LogoFull, LogoLockup } from "../components/Logo";
import { Pill } from "../components/Pill";
import { ProgressBar } from "../components/ProgressBar";
import { ThemeToggle } from "../components/ThemeToggle";

// Re-render when the theme changes (toggle or system), so swatches show live values.
function useThemeVersion(): number {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const bump = () => setVersion((v) => v + 1);
    const observer = new MutationObserver(bump);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", bump);
    return () => {
      observer.disconnect();
      media.removeEventListener("change", bump);
    };
  }, []);
  return version;
}

const cssVar = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

function luminance(hex: string): number {
  const rgb = hex.replace("#", "").match(/../g)?.map((h) => parseInt(h, 16) / 255) ?? [0, 0, 0];
  const [r, g, b] = rgb.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-2xl font-black tracking-tight">{title}</h2>
        {note && <p className="text-ink-muted">{note}</p>}
      </div>
      {children}
    </section>
  );
}

const BRAND: { name: string; v: string; cls: string; use: string }[] = [
  { name: "forest", v: "--brand-forest", cls: "bg-forest", use: "Headings, primary dark, button edges" },
  { name: "leaf", v: "--brand-leaf", cls: "bg-leaf", use: "Primary brand green: fills, bars, chart lines" },
  { name: "mint", v: "--brand-mint", cls: "bg-mint", use: "Accents, focus glow, success" },
  { name: "cream", v: "--brand-cream", cls: "bg-cream", use: "Page background (light)" },
  { name: "capy", v: "--brand-capy", cls: "bg-capy", use: "Mascot fur, hard difficulty" },
  { name: "capy-dark", v: "--brand-capy-dark", cls: "bg-capy-dark", use: "Mascot shading" },
  { name: "coin", v: "--brand-coin", cls: "bg-coin", use: "Points, rewards, coin buttons" },
  { name: "sky", v: "--brand-sky", cls: "bg-sky", use: "Soft highlights, hero backdrop" },
  { name: "blush", v: "--brand-blush", cls: "bg-blush", use: "Warm accents, gentle warnings" },
];

const SEMANTIC: { name: string; v: string; use: string }[] = [
  { name: "canvas", v: "--canvas", use: "Page background" },
  { name: "surface", v: "--surface", use: "Cards, bars" },
  { name: "surface-2", v: "--surface-2", use: "Inset panels, progress track" },
  { name: "line", v: "--line", use: "2px borders" },
  { name: "ink", v: "--ink", use: "Body text" },
  { name: "ink-muted", v: "--ink-muted", use: "Secondary text" },
  { name: "ink-faint", v: "--ink-faint", use: "Placeholders, inactive tabs (large text only)" },
  { name: "heading", v: "--heading", use: "Headings (forest, mint in dark)" },
  { name: "primary", v: "--primary", use: "Buttons, links (leaf, deepened for contrast)" },
  { name: "primary-edge", v: "--primary-edge", use: "Button bottom edge" },
  { name: "primary-soft", v: "--primary-soft", use: "Selected / success backgrounds" },
  { name: "link", v: "--link", use: "Green text: links, +pts (mint in dark)" },
  { name: "coin-edge", v: "--coin-edge", use: "Coin button edge" },
  { name: "danger", v: "--danger", use: "Errors" },
  { name: "danger-soft", v: "--danger-soft", use: "Error backgrounds" },
  { name: "warn-ink", v: "--warn-ink", use: "Warning text" },
  { name: "warn-soft", v: "--warn-soft", use: "Warning backgrounds" },
  { name: "sky-soft", v: "--sky-soft", use: "Info backgrounds" },
];

const PAIRS: { label: string; fg: string; bg: string; large?: boolean }[] = [
  { label: "Body text on canvas", fg: "--ink", bg: "--canvas" },
  { label: "Muted text on surface", fg: "--ink-muted", bg: "--surface" },
  { label: "Heading on canvas", fg: "--heading", bg: "--canvas" },
  { label: "Button text on primary", fg: "--on-primary", bg: "--primary" },
  { label: "Coin button text", fg: "--on-coin", bg: "--brand-coin" },
  { label: "Link text on surface", fg: "--link", bg: "--surface" },
  { label: "Danger on surface", fg: "--danger", bg: "--surface" },
  { label: "Faint text on surface (large only)", fg: "--ink-faint", bg: "--surface", large: true },
];

function Swatch({ name, value, cls, use, style }: { name: string; value: string; cls?: string; use: string; style?: React.CSSProperties }) {
  return (
    <div className="card overflow-hidden">
      <div className={`h-20 border-b-2 border-line ${cls ?? ""}`} style={style} />
      <div className="p-3">
        <p className="font-extrabold text-heading">{name}</p>
        <p className="font-mono text-sm text-ink-muted">{value.toUpperCase()}</p>
        <p className="mt-1 text-xs text-ink-muted">{use}</p>
      </div>
    </div>
  );
}

const VARIANTS: ButtonVariant[] = ["primary", "secondary", "coin", "danger", "ghost"];
const STATES: { label: string; cls?: string; disabled?: boolean; loading?: boolean }[] = [
  { label: "Default" },
  { label: "Hover", cls: "is-hover" },
  { label: "Pressed", cls: "is-pressed" },
  { label: "Focus", cls: "is-focus" },
  { label: "Disabled", disabled: true },
  { label: "Loading", loading: true },
];

export default function Styleguide() {
  useThemeVersion();
  const [pct, setPct] = useState(42);

  return (
    <main className="mx-auto max-w-6xl space-y-14 px-4 py-8 lg:px-10 lg:py-12">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <LogoLockup size="lg" />
          <p className="mt-2 text-ink-muted">Design system · every token reads live from index.css, so edits show up here.</p>
        </div>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <Link to="/" className="btn btn-secondary btn-sm">
            Back to app
          </Link>
        </div>
      </header>

      <Section title="Brand colors" note="Fixed across light and dark. Use for fills and illustration; text uses semantic tokens.">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {BRAND.map((c) => (
            <Swatch key={c.name} name={c.name} value={cssVar(c.v)} cls={c.cls} use={c.use} />
          ))}
        </div>
      </Section>

      <Section title="Semantic tokens" note="These switch for dark mode. Toggle the theme above to compare.">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {SEMANTIC.map((c) => (
            <Swatch key={c.name} name={c.name} value={cssVar(c.v)} use={c.use} style={{ background: `var(${c.v})` }} />
          ))}
        </div>
      </Section>

      <Section title="Contrast check" note="WCAG: 4.5:1 for normal text, 3:1 for large bold text. Recomputed live for the current theme.">
        <div className="card divide-y-2 divide-line">
          {PAIRS.map((p) => {
            const fg = cssVar(p.fg);
            const bg = cssVar(p.bg);
            const ratio = contrast(fg, bg);
            const pass = ratio >= (p.large ? 3 : 4.5);
            return (
              <div key={p.label} className="flex items-center gap-4 p-3">
                <span className="w-24 shrink-0 rounded-xl px-3 py-2 text-center font-extrabold" style={{ color: fg, background: bg }}>
                  Aa 123
                </span>
                <span className="flex-1">{p.label}</span>
                <span className="font-mono tabular-nums">{ratio.toFixed(2)}:1</span>
                <Pill tone={pass ? "leaf" : "blush"}>{pass ? "Pass" : "Fail"}</Pill>
              </div>
            );
          })}
        </div>
      </Section>

      <Section title="Typography" note="Nunito. 900/800 for headings and numbers, 600 for body.">
        <div className="card space-y-3 p-6">
          <p className="text-5xl font-black tracking-tight text-heading">$1,240.00</p>
          <h1 className="text-4xl font-black tracking-tight">Page title · 900</h1>
          <h2 className="text-2xl font-extrabold">Section heading · 800</h2>
          <p className="text-lg font-extrabold text-ink">Card title · 800</p>
          <p className="font-semibold text-ink">Body copy · 600. Nice and steady wins the race. Small wins add up over time.</p>
          <p className="text-sm font-semibold text-ink-muted">Secondary copy · 600, muted</p>
          <p className="text-xs font-extrabold uppercase tracking-wide text-ink-muted">Label · 800 uppercase</p>
        </div>
      </Section>

      <Section title="Buttons" note="Solid 4px bottom edge that presses down on tap. Try clicking the live row.">
        <div className="card overflow-x-auto p-4">
          <table className="w-full min-w-[720px] border-separate border-spacing-x-2 border-spacing-y-3 text-left">
            <thead>
              <tr className="text-xs font-extrabold uppercase tracking-wide text-ink-muted">
                <th className="w-28">Variant</th>
                {STATES.map((s) => (
                  <th key={s.label}>{s.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {VARIANTS.map((v) => (
                <tr key={v}>
                  <td className="font-extrabold capitalize text-heading">{v}</td>
                  {STATES.map((s) => (
                    <td key={s.label}>
                      <Button variant={v} size="sm" className={s.cls} disabled={s.disabled} loading={s.loading} tabIndex={-1}>
                        {s.loading ? "Saving" : "Save"}
                      </Button>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card flex flex-wrap items-end gap-3 p-4">
          <Button size="sm">Small</Button>
          <Button>Medium</Button>
          <Button size="lg">Large</Button>
          <Button variant="coin" size="lg">
            Claim +30 pts
          </Button>
          <div className="w-full sm:w-64">
            <Button block>Full width</Button>
          </div>
        </div>
      </Section>

      <Section title="Cards" note="Rounded-2xl with a 2px border. No drop shadows; the border does the work.">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <div className="card p-5">
            <p className="text-lg font-extrabold text-heading">Basic card</p>
            <p className="mt-1 text-ink-muted">Surface, 2px line border, 16px radius.</p>
          </div>
          <div className="card p-5">
            <div className="flex items-center justify-between">
              <Difficulty level="medium" />
              <span className="text-sm font-extrabold text-link">+50 pts</span>
            </div>
            <p className="mt-3 text-lg font-extrabold">Pick one no-spend day before Sunday.</p>
            <Button block className="mt-4">
              Accept challenge
            </Button>
          </div>
          <div className="rounded-2xl border-2 border-leaf bg-primary-soft p-5">
            <p className="text-lg font-extrabold text-heading">Selected / done</p>
            <p className="mt-1 text-ink-muted">Leaf border on a soft green fill.</p>
            <p className="mt-3 rounded-2xl bg-coin px-4 py-3 text-center font-extrabold text-on-coin">Done! +30 pts</p>
          </div>
          <div className="card p-5">
            <p className="text-xs font-extrabold uppercase tracking-wide text-ink-muted">Chill streak</p>
            <p className="text-4xl font-black text-heading">🔥 3 weeks</p>
            <p className="text-ink-muted">Nice and steady.</p>
          </div>
          <div className="rounded-2xl border-2 border-forest bg-forest p-5 text-white">
            <p className="text-sm text-white/80">Left over this pay period</p>
            <p className="text-5xl font-black tracking-tight">$84.01</p>
            <p className="mt-1 text-white/80">Hero card on forest.</p>
          </div>
          <div className="rounded-2xl border-2 border-mint bg-primary-soft px-4 py-3 font-extrabold text-heading">
            Notice banner: Nice and steady. +30 points.
          </div>
        </div>
      </Section>

      <Section title="Progress bars" note="Thick pills with a glossy highlight. Leaf for goals, coin for points and levels, sky for neutral.">
        <div className="card space-y-5 p-5">
          {[0, 8, 42, 75, 100].map((v) => (
            <div key={v} className="flex items-center gap-4">
              <span className="w-12 text-right font-extrabold tabular-nums text-ink-muted">{v}%</span>
              <div className="flex-1">
                <ProgressBar pct={v} label={`${v}% example`} />
              </div>
            </div>
          ))}
          <div className="grid gap-4 border-t-2 border-line pt-5 md:grid-cols-3">
            <div className="space-y-2">
              <p className="text-sm font-extrabold text-ink-muted">Leaf · lg</p>
              <ProgressBar pct={pct} size="lg" label="Large leaf example" />
            </div>
            <div className="space-y-2">
              <p className="text-sm font-extrabold text-ink-muted">Coin · md (level progress)</p>
              <ProgressBar pct={pct} tone="coin" label="Coin example" />
            </div>
            <div className="space-y-2">
              <p className="text-sm font-extrabold text-ink-muted">Sky · sm</p>
              <ProgressBar pct={pct} tone="sky" size="sm" label="Sky example" />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="secondary" size="sm" onClick={() => setPct((p) => Math.max(0, p - 15))}>
              − 15%
            </Button>
            <Button size="sm" onClick={() => setPct((p) => Math.min(100, p + 15))}>
              + 15%
            </Button>
            <span className="font-extrabold tabular-nums text-ink-muted">{pct}%</span>
          </div>
        </div>
      </Section>

      <Section title="Pills, difficulty, inputs">
        <div className="card space-y-5 p-5">
          <div className="flex flex-wrap gap-2">
            <Pill tone="leaf">✓ Verified</Pill>
            <Pill tone="coin">Unverified</Pill>
            <Pill tone="sky">Flex</Pill>
            <Pill tone="blush">▼1</Pill>
            <Pill tone="neutral">Level 3</Pill>
          </div>
          <div className="flex flex-wrap gap-6">
            <Difficulty level="easy" />
            <Difficulty level="medium" />
            <Difficulty level="hard" />
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <input className="field" placeholder="Placeholder" aria-label="Example input" />
            <input className="field" defaultValue="Spring break trip" aria-label="Example filled input" />
            <div>
              <input className="field border-danger" defaultValue="12.345" aria-label="Example invalid input" />
              <p className="mt-1 text-sm text-danger">Enter an amount, like 25.</p>
            </div>
          </div>
        </div>
      </Section>

      <Section title="Bottom tab bar" note="Large icons, short labels, active tab in a mint pill.">
        <div className="mx-auto max-w-sm overflow-hidden rounded-2xl border-2 border-line">
          <div className="grid grid-cols-5 bg-surface px-1 pt-2 pb-2">
            {["Home", "Goals", "Challenges", "Ranks", "Group"].map((label, i) => (
              <span key={label} className={`flex flex-col items-center gap-0.5 text-[11px] font-extrabold ${i === 0 ? "text-heading" : "text-ink-faint"}`}>
                <span className={`flex h-10 w-14 items-center justify-center rounded-2xl ${i === 0 ? "bg-primary-soft text-link" : ""}`}>
                  <span className="h-6 w-6 rounded-lg border-[2.4px] border-current" />
                </span>
                {label}
              </span>
            ))}
          </div>
        </div>
      </Section>

      <Section title="Voice" note="Calm capybara: short, warm, encouraging. Never pushy, never financial advice.">
        <div className="grid gap-3 md:grid-cols-2">
          {[
            ["Nice and steady.", "After a completed challenge or a steady week"],
            ["Chill streak: 3 weeks", "Streak label"],
            ["All done. Time to chill.", "No challenges left"],
            ["Saving's better together", "No groups yet"],
            ["Hang tight. Your money is fine; we just need another try.", "Load failures, never raw errors"],
            ["Life happens. Here are two ways to keep going.", "Goal flex"],
          ].map(([line, when]) => (
            <div key={line} className="card p-4">
              <p className="text-lg font-extrabold text-heading">“{line}”</p>
              <p className="text-sm text-ink-muted">{when}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Empty state" note="Mascot + one-line title + short body + optional action.">
        <div className="grid gap-4 md:grid-cols-2">
          <EmptyState mascot="drink" title="All done. Time to chill.">
            New challenges show up as your spending changes.
          </EmptyState>
          <EmptyState mascot="coin" title="No goals yet" action={<Button>Create a goal</Button>}>
            Pick something you'd love to have in a few months.
          </EmptyState>
        </div>
      </Section>

      <Section title="Brand assets" note="Full logos sit on cream so the forest lettering stays readable in dark mode.">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="card p-4">
            <LogoFull className="h-48" />
            <p className="mt-2 text-sm font-extrabold text-ink-muted">logo.png · side rail</p>
          </div>
          <div className="card p-4">
            <div className="rounded-3xl bg-cream p-4">
              <img src="/brand/logo-wordmark.png" alt="CapyBalance wordmark" className="mx-auto h-48 object-contain" />
            </div>
            <p className="mt-2 text-sm font-extrabold text-ink-muted">logo-wordmark.png · login</p>
          </div>
          <div className="card flex flex-col p-4">
            <div className="flex flex-1 items-center justify-center rounded-3xl bg-surface-2 p-4">
              <LogoLockup size="lg" />
            </div>
            <p className="mt-2 text-sm font-extrabold text-ink-muted">Badge + Nunito lockup · phone header</p>
          </div>
          {[
            ["mascot-coin.png", "Login hero, goal empty states"],
            ["mascot-drink.png", "Challenge & leaderboard empty states"],
            ["icon-light.png", "Favicon / app icon"],
            ["icon-dark.png", "App icon (dark)"],
            ["logo-badge.png", "Header badge"],
          ].map(([file, use]) => (
            <div key={file} className="card p-4">
              <div className="flex h-40 items-center justify-center rounded-3xl bg-cream">
                {file === "logo-badge.png" ? <LogoBadge className="h-32 w-32" /> : <img src={`/brand/${file}`} alt="" className="h-32 object-contain" />}
              </div>
              <p className="mt-2 text-sm font-extrabold text-ink-muted">
                {file} · {use}
              </p>
            </div>
          ))}
        </div>
      </Section>
    </main>
  );
}
