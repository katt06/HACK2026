import type { IsoDateTime } from "../contract.js";

export const LLM_CALLS_PER_HOUR = 10;
const HOUR_MS = 60 * 60 * 1000;

// Sliding window: keeps only calls from the last hour, and records this one if there's room.
export function takeRateLimitSlot(
  previousCalls: IsoDateTime[],
  now: Date,
  limit = LLM_CALLS_PER_HOUR,
  windowMs = HOUR_MS,
): { allowed: boolean; calls: IsoDateTime[] } {
  const recent = previousCalls.filter((t) => now.getTime() - Date.parse(t) < windowMs);
  if (recent.length >= limit) return { allowed: false, calls: recent };
  return { allowed: true, calls: [...recent, now.toISOString()] };
}
