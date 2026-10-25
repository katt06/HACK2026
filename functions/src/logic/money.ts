import type { Cents } from "../contract.js";

// 124000 → "$1,240.00"
export function formatCents(cents: Cents): string {
  const dollars = (Math.abs(cents) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${cents < 0 ? "-" : ""}$${dollars}`;
}

// 34012 → "$340". For summaries, where cents are noise.
export function formatDollars(cents: Cents): string {
  return `$${Math.round(cents / 100).toLocaleString("en-US")}`;
}
