import { useState } from "react";
import type { LeaderboardEntry } from "@contract";

// Everyone's goal progress as columns (0–100%, my own in the deep green), with each person's weekly
// streak underneath. Percentages only, so no dollar amounts are shared.
export function HerdChart({ entries }: { entries: LeaderboardEntry[] }) {
  const [active, setActive] = useState<string | null>(null);
  const rows = [...entries].sort((a, b) => b.goalProgressPct - a.goalProgressPct || a.displayName.localeCompare(b.displayName));
  const shown = rows.find((r) => r.userId === active);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-muted">
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="h-3 w-3 rounded-[4px] bg-primary" />
          You
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="h-3 w-3 rounded-[4px] bg-mint" />
          Friends
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden>🔥</span> Streak weeks
        </span>
      </div>

      <div className="relative flex gap-1.5 overflow-x-auto pt-5 pb-1 sm:gap-2" onPointerLeave={() => setActive(null)}>
        {/* y-axis */}
        <div aria-hidden className="relative h-48 w-9 shrink-0 text-right text-[11px] text-ink-muted tabular-nums lg:h-56">
          <span className="absolute right-0 -translate-y-1/2" style={{ top: 0 }}>
            100%
          </span>
          <span className="absolute right-0 -translate-y-1/2" style={{ top: "50%" }}>
            50%
          </span>
          <span className="absolute right-0 -translate-y-1/2" style={{ top: "100%" }}>
            0%
          </span>
        </div>

        <ol className="relative flex flex-1 gap-1.5 sm:gap-2 lg:gap-4">
          {/* gridlines behind the columns */}
          <li aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-48 lg:h-56">
            <span className="absolute inset-x-0 top-0 border-t-2 border-dashed border-line" />
            <span className="absolute inset-x-0 top-1/2 border-t border-line" />
            <span className="absolute inset-x-0 bottom-0 border-t-2 border-line" />
          </li>

          {rows.map((r) => {
            return (
              <li key={r.userId} className="relative flex min-w-11 flex-1 flex-col items-center">
                <button
                  type="button"
                  onPointerEnter={() => setActive(r.userId)}
                  onFocus={() => setActive(r.userId)}
                  onBlur={() => setActive(null)}
                  onClick={() => setActive(r.userId)}
                  aria-label={`${r.displayName}${r.isMe ? " (you)" : ""}: ${r.goalProgressPct}% of their goal, ${r.streak}-week streak, level ${r.level}`}
                  className="relative h-48 w-full max-w-16 rounded-t-lg outline-none focus-visible:ring-2 focus-visible:ring-leaf lg:h-56"
                >
                  <span
                    className={`absolute inset-x-0 bottom-0 rounded-t-[4px] transition-[height] duration-700 ${r.isMe ? "bg-primary" : "bg-mint"} ${active === r.userId ? "brightness-110" : ""}`}
                    style={{ height: `${Math.max(r.goalProgressPct, 1)}%` }}
                  />
                  <span className="absolute inset-x-0 mb-1 text-center text-xs font-extrabold tabular-nums" style={{ bottom: `${r.goalProgressPct}%` }}>
                    {r.goalProgressPct}%
                  </span>
                </button>
                <span className={`mt-1.5 w-full truncate text-center text-xs font-extrabold ${r.isMe ? "text-link" : ""}`}>{r.isMe ? "You" : r.displayName}</span>
                <span aria-hidden className="mt-0.5 text-xs font-extrabold tabular-nums text-ink-muted">
                  {r.streak === 0 ? "–" : `🔥 ${r.streak}`}
                </span>
              </li>
            );
          })}
        </ol>
      </div>

      <p className="mt-2 min-h-5 text-sm text-ink-muted" aria-live="polite">
        {shown ? (
          <>
            <strong className="text-ink">{shown.isMe ? "You" : shown.displayName}</strong>: {shown.goalProgressPct}% of {shown.isMe ? "your" : "their"} goal · <span aria-hidden>🔥</span>{" "}
            {shown.streak} {shown.streak === 1 ? "week" : "weeks"} · Lv {shown.level}
          </>
        ) : (
          "Tap a column for details."
        )}
      </p>
    </div>
  );
}
