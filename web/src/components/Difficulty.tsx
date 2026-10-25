import type { Difficulty as Level } from "@contract";

// Bars fill up with difficulty; the label carries the meaning too, so it never relies on color alone.
const LEVELS: Record<Level, { bars: number; label: string; color: string }> = {
  easy: { bars: 1, label: "Easy", color: "bg-leaf" },
  medium: { bars: 2, label: "Medium", color: "bg-coin" },
  hard: { bars: 3, label: "Hard", color: "bg-capy" },
};

export function Difficulty({ level }: { level: Level }) {
  const { bars, label, color } = LEVELS[level];
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wide text-ink-muted">
      <span aria-hidden className="flex items-end gap-0.5">
        {[1, 2, 3].map((i) => (
          <span key={i} className={`w-1.5 rounded-full ${i <= bars ? color : "bg-line"}`} style={{ height: 5 + i * 3 }} />
        ))}
      </span>
      {label}
    </span>
  );
}
