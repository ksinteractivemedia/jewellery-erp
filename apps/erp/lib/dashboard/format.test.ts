import { describe, expect, it } from "vitest";
import { changeVs, daysLabel, plural, timeAgo } from "./format";
import { parseDashboardParams } from "./params";

describe("changeVs", () => {
  it("is null — nothing to show — when there is no previous period", () => {
    expect(changeVs(100, null)).toBeNull();
  });
  it("reports direction and size against the previous period", () => {
    expect(changeVs(112, 100)).toEqual({ direction: "up", label: "12.0%" });
    expect(changeVs(75, 100)).toEqual({ direction: "down", label: "25.0%" });
    expect(changeVs(520_000, 320_000)).toEqual({ direction: "up", label: "62.5%" });
  });
  it("calls a negligible move 'no change'", () => {
    expect(changeVs(100, 100)).toEqual({ direction: "flat", label: "no change" });
    expect(changeVs(100.01, 100)).toEqual({ direction: "flat", label: "no change" });
  });
  it("does not divide by zero: growth from nothing is 'new'", () => {
    expect(changeVs(50, 0)).toEqual({ direction: "up", label: "new" });
    expect(changeVs(0, 0)).toEqual({ direction: "flat", label: "no change" });
  });
  it("handles a drop to zero", () => {
    expect(changeVs(0, 200)).toEqual({ direction: "down", label: "100.0%" });
  });
});

describe("timeAgo", () => {
  const now = Date.parse("2026-09-20T12:00:00Z");
  it.each([
    ["2026-09-20T11:59:30Z", "just now"],
    ["2026-09-20T11:55:00Z", "5 min ago"],
    ["2026-09-20T09:00:00Z", "3 h ago"],
    ["2026-09-19T11:00:00Z", "1 day ago"],
    ["2026-09-16T12:00:00Z", "4 days ago"],
  ])("%s → %s", (iso, label) => expect(timeAgo(iso, now)).toBe(label));
  it("falls back to a date beyond a week", () => {
    expect(timeAgo("2026-09-01T12:00:00Z", now)).toMatch(/1 Sept?/);
  });
});

describe("small labels", () => {
  it("names durations and counts", () => {
    expect(daysLabel(0)).toBe("today");
    expect(daysLabel(1)).toBe("1 day");
    expect(daysLabel(14)).toBe("14 days");
    expect(plural(1, "piece")).toBe("1 piece");
    expect(plural(3, "piece")).toBe("3 pieces");
  });
});

describe("parseDashboardParams — the URL is untrusted", () => {
  it("defaults to 30 days and no branch or location", () => {
    expect(parseDashboardParams({})).toEqual({ range: "30d", from: undefined, to: undefined, branch: undefined, location: undefined });
  });
  it("reads a well-formed URL", () => {
    expect(parseDashboardParams({ range: "custom", from: "2026-09-01", to: "2026-09-10", branch: "64b0c0ffee0000000000aaaa", location: "64b0c0ffee0000000000bbbb" })).toMatchObject({ range: "custom", branch: "64b0c0ffee0000000000aaaa", location: "64b0c0ffee0000000000bbbb" });
  });
  it("discards a hand-edited range preset, branch or location", () => {
    expect(parseDashboardParams({ range: "forever", branch: "main", location: "<script>" })).toMatchObject({ range: "30d", branch: undefined, location: undefined });
  });
});
