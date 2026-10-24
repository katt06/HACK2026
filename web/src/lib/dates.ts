import type { IsoDate } from "@contract";

// Calendar-date math on "YYYY-MM-DD" strings. Uses UTC internally so DST never shifts a day.
const DAY_MS = 86_400_000;

const toUtc = (iso: IsoDate) => {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};

export function todayIso(now = new Date()): IsoDate {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((toUtc(to) - toUtc(from)) / DAY_MS);
}

export function addDays(iso: IsoDate, days: number): IsoDate {
  return new Date(toUtc(iso) + days * DAY_MS).toISOString().slice(0, 10);
}
