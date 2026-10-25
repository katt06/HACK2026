import type { Difficulty as Level } from "@contract";

const LEVELS: Record<Level, { bars: number; label: string; color: string; text: string }> = {
  easy: { bars: 1, label: "Easy", color: "bg-sky-500", text: "text-sky-700" },
  medium: { bars: 2, label: "Medium", color: "bg-violet-500", text: "text-violet-700" },
  hard: { bars: 3, label: "Hard", color: "bg-rose-500", text: "text-rose-700" },
};

// Signal-strength style bars plus a label, so difficulty doesn't rely on color alone.
export function Difficulty({ level }: { level: Level }) {
  const { bars, label, color, text } = LEVELS[level];
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${text}`}>
      <span aria-hidden className="flex items-end gap-0.5">
        {[1, 2, 3].map((i) => (
          <span key={i} className={`w-1 rounded-sm ${i <= bars ? color : "bg-slate-200"}`} style={{ height: 4 + i * 3 }} />
        ))}
      </span>
      {label}
    </span>
  );
}
