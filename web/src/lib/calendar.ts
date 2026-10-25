import type { IsoDate } from "@contract";
import { addDays, startOfWeek } from "./dates";

// Mon–Sun weeks covering a month (month is 1–12), padded with days from the months around it.
export function monthWeeks(year: number, month: number): IsoDate[][] {
  const pad = (n: number) => String(n).padStart(2, "0");
  const first = `${year}-${pad(month)}-01`;
  const last = addDays(month === 12 ? `${year + 1}-01-01` : `${year}-${pad(month + 1)}-01`, -1);
  const weeks: IsoDate[][] = [];
  for (let week = startOfWeek(first); week <= last; week = addDays(week, 7)) {
    weeks.push(Array.from({ length: 7 }, (_, i) => addDays(week, i)));
  }
  return weeks;
}

// Week starts (Mondays) of the current streak. The server counts back from this week, and this week only
// counts once it's met, so: if there's already a contribution this week, the streak ends this week;
// otherwise it ends last week. (Paused weeks are rare and not shown.)
export function streakWeeks(streak: number, today: IsoDate, contributionDays: Iterable<IsoDate>): Set<IsoDate> {
  const thisWeek = startOfWeek(today);
  const savedThisWeek = [...contributionDays].some((d) => d >= thisWeek && d <= today);
  const end = savedThisWeek ? thisWeek : addDays(thisWeek, -7);
  return new Set(Array.from({ length: streak }, (_, i) => addDays(end, -7 * i)));
}

export function groupByDay<T>(items: T[], dayOf: (item: T) => IsoDate): Map<IsoDate, T[]> {
  const days = new Map<IsoDate, T[]>();
  for (const item of items) {
    const day = dayOf(item);
    days.set(day, [...(days.get(day) ?? []), item]);
  }
  return days;
}
