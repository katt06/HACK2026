import { describe, expect, it } from "vitest";
import { groupByDay, monthWeeks, streakWeeks } from "./calendar";
import { localDate, startOfWeek } from "./dates";

describe("startOfWeek", () => {
  it("returns the Monday", () => {
    expect(startOfWeek("2026-10-24")).toBe("2026-10-19"); // Sat
    expect(startOfWeek("2026-10-19")).toBe("2026-10-19"); // Mon
    expect(startOfWeek("2026-10-25")).toBe("2026-10-19"); // Sun
  });
});

describe("localDate", () => {
  it("uses the local calendar day", () => {
    expect(localDate(new Date(2026, 9, 24, 23, 30).toISOString())).toBe("2026-10-24");
  });
});

describe("monthWeeks", () => {
  it("covers October 2026 in Mon–Sun rows", () => {
    const weeks = monthWeeks(2026, 10);
    expect(weeks).toHaveLength(5);
    expect(weeks[0][0]).toBe("2026-09-28");
    expect(weeks[0][3]).toBe("2026-10-01");
    expect(weeks.at(-1)!.at(-1)).toBe("2026-11-01");
    expect(weeks.every((w) => w.length === 7)).toBe(true);
  });

  it("handles December into January", () => {
    expect(monthWeeks(2026, 12).at(-1)!.at(-1)).toBe("2027-01-03");
  });
});

describe("streakWeeks", () => {
  const today = "2026-10-24"; // week of Oct 19

  it("ends this week once you've saved this week", () => {
    expect([...streakWeeks(3, today, ["2026-10-20"])]).toEqual(["2026-10-19", "2026-10-12", "2026-10-05"]);
  });

  it("ends last week while this week is still open", () => {
    expect([...streakWeeks(2, today, ["2026-10-14"])]).toEqual(["2026-10-12", "2026-10-05"]);
  });

  it("is empty with no streak", () => {
    expect(streakWeeks(0, today, ["2026-10-20"]).size).toBe(0);
  });
});

describe("groupByDay", () => {
  it("buckets items by day", () => {
    const days = groupByDay([{ d: "2026-10-01" }, { d: "2026-10-02" }, { d: "2026-10-01" }], (x) => x.d);
    expect(days.get("2026-10-01")).toHaveLength(2);
    expect(days.get("2026-10-02")).toHaveLength(1);
  });
});
