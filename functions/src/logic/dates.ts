// Calendar math on IsoDate strings ("2026-10-24"), always in UTC so results don't depend on the server's timezone.
import type { IsoDate } from "../contract.js";

const DAY_MS = 86_400_000;

export function parseIsoDate(date: IsoDate): number {
  return Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)));
}

export function toIsoDate(ms: number): IsoDate {
  return new Date(ms).toISOString().slice(0, 10);
}

export function todayIso(now: Date = new Date()): IsoDate {
  return toIsoDate(now.getTime());
}

export function addDays(date: IsoDate, days: number): IsoDate {
  return toIsoDate(parseIsoDate(date) + days * DAY_MS);
}

// Same day of month, clamped to the month's last day (Jan 31 + 1 month = Feb 28).
export function addMonths(date: IsoDate, months: number): IsoDate {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7)) - 1 + months;
  const day = Number(date.slice(8, 10));
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return toIsoDate(Date.UTC(year, month, Math.min(day, lastDay)));
}

// to - from, in whole days.
export function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((parseIsoDate(to) - parseIsoDate(from)) / DAY_MS);
}

// 0 = Sunday … 6 = Saturday
export function dayOfWeek(date: IsoDate): number {
  return new Date(parseIsoDate(date)).getUTCDay();
}

export function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && toIsoDate(parseIsoDate(value)) === value;
}
