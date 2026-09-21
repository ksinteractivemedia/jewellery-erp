import { describe, expect, it } from "vitest";
import { addDays, daysBetween, formatRange, isValidCustomRange, resolveDashboardRange } from "./range";

const TODAY = "2026-09-20";

describe("resolveDashboardRange", () => {
  it.each([
    ["today", { from: "2026-09-20", to: "2026-09-20", days: 1 }],
    ["7d", { from: "2026-09-14", to: "2026-09-20", days: 7 }],
    ["30d", { from: "2026-08-22", to: "2026-09-20", days: 30 }],
    ["mtd", { from: "2026-09-01", to: "2026-09-20", days: 20 }],
  ] as const)("%s", (preset, expected) => {
    expect(resolveDashboardRange(preset, TODAY)).toEqual({ preset, ...expected });
  });

  it("starts 'this month' on the 1st, including on the 1st itself", () => {
    expect(resolveDashboardRange("mtd", "2026-10-01")).toMatchObject({ from: "2026-10-01", to: "2026-10-01", days: 1 });
  });

  it("crosses month and year boundaries", () => {
    expect(resolveDashboardRange("7d", "2027-01-03")).toMatchObject({ from: "2026-12-28", to: "2027-01-03" });
    expect(resolveDashboardRange("30d", "2028-03-01")).toMatchObject({ from: "2028-02-01" }); // leap year: Feb 1–29 plus Mar 1 = 30 days
  });

  it("uses a valid custom range", () => {
    expect(resolveDashboardRange("custom", TODAY, { from: "2026-09-01", to: "2026-09-10" })).toEqual({ preset: "custom", from: "2026-09-01", to: "2026-09-10", days: 10 });
  });

  it.each([
    ["no dates", {}],
    ["only one end", { from: "2026-09-01" }],
    ["reversed", { from: "2026-09-10", to: "2026-09-01" }],
    ["malformed", { from: "1/9/2026", to: "10/9/2026" }],
    ["not a real day", { from: "2026-02-30", to: "2026-03-05" }],
    ["longer than a year", { from: "2025-01-01", to: "2026-09-20" }],
  ])("falls back to 30 days, and says so, for a bad custom range (%s)", (_name, custom) => {
    expect(resolveDashboardRange("custom", TODAY, custom)).toMatchObject({ preset: "30d", from: "2026-08-22", to: "2026-09-20" });
  });

  it("accepts exactly a year and refuses a day more", () => {
    expect(resolveDashboardRange("custom", TODAY, { from: "2025-09-20", to: "2026-09-20" }).preset).toBe("custom");
    expect(resolveDashboardRange("custom", TODAY, { from: "2025-09-19", to: "2026-09-20" }).preset).toBe("30d");
  });
});

describe("day arithmetic and labels", () => {
  it("adds days and counts between", () => {
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(daysBetween("2026-09-01", "2026-09-20")).toBe(19);
  });

  it("labels a range compactly, with the year once", () => {
    expect(formatRange("2026-09-20", "2026-09-20")).toBe("20 Sept 2026");
    expect(formatRange("2026-09-14", "2026-09-20")).toBe("14 Sept – 20 Sept 2026");
    expect(formatRange("2025-12-28", "2026-01-03")).toBe("28 Dec 2025 – 3 Jan 2026");
  });
});

describe("isValidCustomRange — what the date inputs may commit", () => {
  it.each([
    ["a normal range", "2026-09-01", "2026-09-10", true],
    ["a single day", "2026-09-10", "2026-09-10", true],
    ["exactly a year", "2025-09-20", "2026-09-20", true],
    ["a day over a year", "2025-09-19", "2026-09-20", false],
    ["reversed", "2026-09-10", "2026-09-01", false],
    ["half-typed (a year of 0002)", "0002-09-01", "2026-09-10", false],
    ["an empty end", "2026-09-01", "", false],
    ["not a real day", "2026-02-30", "2026-03-05", false],
    ["undefined", undefined, undefined, false],
  ])("%s", (_name, from, to, expected) => {
    expect(isValidCustomRange(from as string | undefined, to as string | undefined)).toBe(expected);
  });
});
