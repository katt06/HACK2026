import { useState } from "react";
import type { Activity } from "../api";
import { groupByDay, monthWeeks, streakWeeks } from "../lib/calendar";
import { localDate, todayIso } from "../lib/dates";
import { formatCents, formatDate } from "../lib/format";

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

// Month view: a coin on days you finished a challenge, a green dot on days you saved, and a mint band
// behind the weeks in your current streak. Tap a day to see what you did.
export function ActivityCalendar({ activity }: { activity: Activity }) {
  const today = todayIso();
  const [month, setMonth] = useState(() => ({ year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) }));
  const [selected, setSelected] = useState<string>(today);

  const challengeDays = groupByDay(activity.completedChallenges, (c) => localDate(c.completedAt));
  const savingDays = groupByDay(activity.contributions, (c) => localDate(c.createdAt));
  const streak = streakWeeks(activity.streak, today, savingDays.keys());
  const weeks = monthWeeks(month.year, month.month);
  const monthPrefix = `${month.year}-${String(month.month).padStart(2, "0")}`;
  const isCurrentMonth = today.startsWith(monthPrefix);
  const title = new Date(month.year, month.month - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const doneThisMonth = [...challengeDays.keys()].filter((d) => d.startsWith(monthPrefix)).length;

  const step = (delta: number) =>
    setMonth(({ year, month: m }) => {
      const index = year * 12 + (m - 1) + delta;
      return { year: Math.floor(index / 12), month: (index % 12) + 1 };
    });

  const describe = (day: string) => {
    const done = challengeDays.get(day)?.length ?? 0;
    const saved = savingDays.has(day);
    const parts = [done ? `${done} challenge${done === 1 ? "" : "s"} done` : "", saved ? "saved toward a goal" : ""].filter(Boolean);
    return `${formatDate(day)}${parts.length ? `: ${parts.join(", ")}` : ""}`;
  };

  const dayChallenges = challengeDays.get(selected) ?? [];
  const daySavings = savingDays.get(selected) ?? [];

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <button onClick={() => step(-1)} className="btn btn-ghost btn-sm" aria-label="Previous month">
          ←
        </button>
        <div className="text-center">
          <p className="text-lg font-extrabold">{title}</p>
          <p className="text-sm text-ink-muted">
            {doneThisMonth} challenge {doneThisMonth === 1 ? "day" : "days"}
            {activity.streak > 0 && (
              <>
                {" "}
                · <span aria-hidden>🔥</span> {activity.streak}-week streak
              </>
            )}
          </p>
        </div>
        <button onClick={() => step(1)} disabled={isCurrentMonth} className="btn btn-ghost btn-sm" aria-label="Next month">
          →
        </button>
      </div>

      <div role="grid" aria-label={`${title} activity`} className="mt-3">
        <div role="row" className="grid grid-cols-7 text-center text-xs font-extrabold text-ink-faint">
          {WEEKDAYS.map((d, i) => (
            <span role="columnheader" key={i} className="py-1">
              {d}
            </span>
          ))}
        </div>
        {weeks.map((week) => {
          const inStreak = streak.has(week[0]);
          return (
            <div role="row" key={week[0]} className={`my-1 grid grid-cols-7 rounded-full ${inStreak ? "bg-primary-soft" : ""}`}>
              {week.map((day) => {
                const inMonth = day.startsWith(monthPrefix);
                const done = challengeDays.has(day);
                const saved = savingDays.has(day);
                const future = day > today;
                return (
                  <button
                    role="gridcell"
                    key={day}
                    onClick={() => setSelected(day)}
                    disabled={future}
                    aria-label={describe(day)}
                    aria-selected={selected === day}
                    title={describe(day)}
                    className="flex flex-col items-center py-1 disabled:cursor-default"
                  >
                    <span
                      className={`flex h-9 w-9 items-center justify-center rounded-full border-2 text-sm font-extrabold tabular-nums transition-colors lg:h-10 lg:w-10 ${
                        done ? "border-coin-edge bg-coin text-on-coin" : "border-transparent"
                      } ${!inMonth || future ? "opacity-35" : ""} ${day === today ? "ring-2 ring-primary ring-offset-2 ring-offset-surface" : ""} ${
                        selected === day && !done ? "bg-surface-2" : ""
                      }`}
                    >
                      {Number(day.slice(8))}
                    </span>
                    <span aria-hidden className={`mt-0.5 h-1.5 w-1.5 rounded-full ${saved && inMonth ? "bg-leaf" : "bg-transparent"}`} />
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>

      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted">
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="h-3 w-3 rounded-full border-2 border-coin-edge bg-coin" />
          Challenge done
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-leaf" />
          Saved money
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="h-3 w-5 rounded-full bg-primary-soft" />
          Streak week
        </span>
      </div>

      <div className="mt-3 rounded-2xl bg-surface-2 px-4 py-3 text-sm" aria-live="polite">
        <p className="font-extrabold">{selected === today ? "Today" : formatDate(selected)}</p>
        {dayChallenges.length === 0 && daySavings.length === 0 ? (
          <p className="text-ink-muted">Nothing logged. Rest days count too.</p>
        ) : (
          <ul className="mt-1 space-y-1">
            {dayChallenges.map((c) => (
              <li key={c.id} className="flex justify-between gap-3">
                <span>{c.description}</span>
                <span className="shrink-0 font-extrabold text-link">+{c.points} XP</span>
              </li>
            ))}
            {daySavings.map((s, i) => (
              <li key={i} className="flex justify-between gap-3">
                <span>Saved toward {s.goalName}</span>
                <span className="shrink-0 font-extrabold">{formatCents(s.amount)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
