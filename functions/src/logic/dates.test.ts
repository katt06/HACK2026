import { describe, expect, it } from "vitest";
import { addDays, addMonths, dayOfWeek, daysBetween, formatDay, isIsoDate, todayIso } from "./dates.js";
import { hashString, mulberry32 } from "./random.js";

describe("dates", () => {
  it("adds days across month and year boundaries", () => {
    expect(addDays("2026-10-30", 3)).toBe("2026-11-02");
    expect(addDays("2027-01-01", -1)).toBe("2026-12-31");
  });

  it("clamps addMonths to the end of shorter months", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2026-11-15", 2)).toBe("2027-01-15");
    expect(addMonths("2026-03-31", -1)).toBe("2026-02-28");
  });

  it("counts days between dates and knows weekdays", () => {
    expect(daysBetween("2026-10-24", "2026-10-30")).toBe(6);
    expect(daysBetween("2026-10-30", "2026-10-24")).toBe(-6);
    expect(dayOfWeek("2026-10-24")).toBe(6); // Saturday
  });

  it("gets today in the user's timezone, falling back to UTC", () => {
    const lateEvening = new Date("2026-10-25T02:30:00Z"); // 10:30pm Oct 24 in New York
    expect(todayIso(lateEvening)).toBe("2026-10-25");
    expect(todayIso(lateEvening, "America/New_York")).toBe("2026-10-24");
    expect(todayIso(lateEvening, "Not/AZone")).toBe("2026-10-25");
  });

  it("formats a day for explanations", () => {
    expect(formatDay("2026-10-30")).toBe("Friday, Oct 30");
  });

  it("validates ISO dates", () => {
    expect(isIsoDate("2026-10-24")).toBe(true);
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("10/24/2026")).toBe(false);
  });
});

describe("mulberry32", () => {
  it("is deterministic per seed and stays in [0, 1)", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const xs = Array.from({ length: 1000 }, () => a());
    expect(Array.from({ length: 1000 }, () => b())).toEqual(xs);
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
    expect(mulberry32(43)()).not.toBe(xs[0]);
  });

  it("hashString gives different seeds for different names", () => {
    expect(hashString("demo-hero")).toBe(hashString("demo-hero"));
    expect(hashString("demo-hero")).not.toBe(hashString("steady-saver"));
  });
});
