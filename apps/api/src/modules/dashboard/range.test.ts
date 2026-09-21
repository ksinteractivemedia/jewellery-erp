import { describe, expect, it } from "vitest";
import { addDays, bucketKeys, bucketOf, businessDay, dayStart, daysBetween, granularityFor, previousRange, resolveRange, weekStart } from "./range";

describe("business days (IST, UTC+5:30)", () => {
  it("puts an instant on the day it is in India, not in UTC", () => {
    expect(businessDay(new Date("2026-09-20T18:29:59.999Z"))).toBe("2026-09-20"); // 23:59:59 IST
    expect(businessDay(new Date("2026-09-20T18:30:00.000Z"))).toBe("2026-09-21"); // midnight IST
    expect(businessDay(new Date("2026-09-20T00:00:00.000Z"))).toBe("2026-09-20"); // 05:30 IST
  });

  it("starts a day at midnight IST", () => {
    expect(dayStart("2026-09-21").toISOString()).toBe("2026-09-20T18:30:00.000Z");
  });

  it("round-trips: an instant is on the day that starts at or before it", () => {
    for (const day of ["2026-01-01", "2026-12-31", "2028-02-29"]) {
      expect(businessDay(dayStart(day))).toBe(day);
      expect(businessDay(new Date(dayStart(day).getTime() - 1))).toBe(addDays(day, -1));
    }
  });

  it("adds days across month, year and leap boundaries", () => {
    expect(addDays("2026-09-30", 1)).toBe("2026-10-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2027-02-28", 1)).toBe("2027-03-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(daysBetween("2026-09-01", "2026-09-10")).toBe(9);
  });

  it("finds the Monday on or before a day", () => {
    expect(weekStart("2026-09-14")).toBe("2026-09-14"); // a Monday
    expect(weekStart("2026-09-16")).toBe("2026-09-14");
    expect(weekStart("2026-09-20")).toBe("2026-09-14"); // a Sunday belongs to the week before
    expect(weekStart("2026-09-21")).toBe("2026-09-21");
  });
});

describe("resolveRange / previousRange", () => {
  const now = new Date("2026-09-20T05:00:00Z"); // 10:30 IST on the 20th

  it("defaults to the last 30 business days ending today", () => {
    const r = resolveRange({}, now);
    expect([r.from, r.to, r.days]).toEqual(["2026-08-22", "2026-09-20", 30]);
    expect(r.start.toISOString()).toBe("2026-08-21T18:30:00.000Z");
    expect(r.end.toISOString()).toBe("2026-09-20T18:30:00.000Z");
  });

  it("uses an explicit range, inclusive of both ends", () => {
    const r = resolveRange({ from: "2026-09-01", to: "2026-09-10" }, now);
    expect(r.days).toBe(10);
    expect(r.end.toISOString()).toBe("2026-09-10T18:30:00.000Z");
  });

  it("makes a single-day range from one day to itself", () => {
    const r = resolveRange({ from: "2026-09-20", to: "2026-09-20" }, now);
    expect(r.days).toBe(1);
    expect(r.end.getTime() - r.start.getTime()).toBe(86_400_000);
  });

  it("finds the equally long period just before", () => {
    const p = previousRange(resolveRange({ from: "2026-09-01", to: "2026-09-10" }, now));
    expect([p.from, p.to, p.days]).toEqual(["2026-08-22", "2026-08-31", 10]);
    expect(p.end.getTime()).toBe(resolveRange({ from: "2026-09-01", to: "2026-09-10" }, now).start.getTime());
  });
});

describe("chart buckets", () => {
  it("is daily up to 45 days, weekly beyond", () => {
    expect(granularityFor(resolveRange({ from: "2026-08-01", to: "2026-09-14" }, new Date()))).toBe("day"); // 45 days
    expect(granularityFor(resolveRange({ from: "2026-08-01", to: "2026-09-15" }, new Date()))).toBe("week"); // 46 days
  });

  it("lists every day, including quiet ones", () => {
    const keys = bucketKeys(resolveRange({ from: "2026-09-14", to: "2026-09-20" }, new Date()), "day");
    expect(keys).toEqual(["2026-09-14", "2026-09-15", "2026-09-16", "2026-09-17", "2026-09-18", "2026-09-19", "2026-09-20"]);
  });

  it("lists every week, starting at the Monday of the first (partial) week", () => {
    expect(bucketKeys(resolveRange({ from: "2026-09-16", to: "2026-09-28" }, new Date()), "week")).toEqual(["2026-09-14", "2026-09-21", "2026-09-28"]);
  });

  it("puts a day in its bucket", () => {
    expect(bucketOf("2026-09-17", "day")).toBe("2026-09-17");
    expect(bucketOf("2026-09-17", "week")).toBe("2026-09-14");
  });
});
