import { describe, expect, it } from "vitest";
import { aggregateSales } from "./sales-aggregation";
import type { DashboardContext, SalesFact } from "./providers";
import { resolveRange } from "./range";

const NOW = new Date("2026-09-20T06:00:00Z"); // 11:30 IST on the 20th
const ctx = (over: Partial<DashboardContext> = {}, range = { from: "2026-09-14", to: "2026-09-20" }): DashboardContext => ({ range: resolveRange(range, NOW), now: NOW, ...over });

let n = 0;
const fact = (over: Partial<SalesFact>): SalesFact => ({
  orderId: `o${++n}`, at: new Date("2026-09-15T05:00:00Z"), channel: "B2C", branchId: "b1", locationId: "l1", revenue: 0, cost: 0, units: 1,
  categoryKey: "rings", categoryName: "Rings", productKey: "p1", productName: "Solitaire Ring", ...over,
});

/** Current week (14–20 Sep) and the week before (7–13 Sep). Worked out by hand in the comments. */
const FACTS: SalesFact[] = [
  fact({ orderId: "o1", at: new Date("2026-09-15T05:00:00Z"), revenue: 100_000, cost: 80_000 }),
  fact({ orderId: "o1", at: new Date("2026-09-15T05:00:00Z"), revenue: 50_000, cost: 40_000, categoryKey: "necklaces", categoryName: "Necklaces", productKey: "p2", productName: "Haar" }), // same order
  fact({ orderId: "o2", at: new Date("2026-09-16T05:00:00Z"), channel: "B2B", revenue: 300_000, cost: 240_000, units: 3 }),
  fact({ orderId: "o3", at: new Date("2026-09-20T05:30:00Z"), revenue: 70_000, cost: 50_000, productKey: "p3", productName: "Band", locationId: "l2" }), // today
  fact({ orderId: "o4", at: new Date("2026-09-10T05:00:00Z"), revenue: 120_000, cost: 90_000 }), // previous week
  fact({ orderId: "o5", at: new Date("2026-09-08T05:00:00Z"), channel: "B2B", revenue: 200_000, cost: 150_000 }), // previous week
  fact({ orderId: "o6", at: new Date("2026-08-01T05:00:00Z"), revenue: 999_999, cost: 1 }), // in neither
  fact({ orderId: "o7", at: new Date("2026-09-15T05:00:00Z"), revenue: 999, cost: 1, branchId: "b2", locationId: "l9" }), // another branch
];

describe("aggregateSales", () => {
  const data = aggregateSales(FACTS, ctx({ branchId: "b1" }));

  it("totals revenue, by channel, for the range", () => {
    expect(data.revenue.value).toBe(520_000); // 100k + 50k + 300k + 70k
    expect(data.b2cRevenue.value).toBe(220_000);
    expect(data.b2bRevenue.value).toBe(300_000);
  });

  it("counts orders, not order lines", () => {
    expect(data.orders.value).toBe(3); // o1 has two lines
  });

  it("compares each KPI with the equally long period before it", () => {
    expect(data.revenue.previous).toBe(320_000);
    expect(data.b2cRevenue.previous).toBe(120_000);
    expect(data.b2bRevenue.previous).toBe(200_000);
    expect(data.orders.previous).toBe(2);
  });

  it("reports today's revenue for the business day, whatever the range", () => {
    expect(data.todayRevenue).toBe(70_000);
    expect(aggregateSales(FACTS, ctx({ branchId: "b1" }, { from: "2026-09-01", to: "2026-09-05" })).todayRevenue).toBe(70_000);
  });

  it("computes margin and margin percent from revenue − cost", () => {
    expect(data.grossMargin).toEqual({ restricted: false, value: 110_000, previous: 80_000, percentage: 21.15 }); // 110/520
  });

  it("gives a zero-filled daily trend split by channel", () => {
    expect(data.trend.granularity).toBe("day");
    expect(data.trend.points).toHaveLength(7);
    expect(data.trend.points.find((p) => p.date === "2026-09-15")).toEqual({ date: "2026-09-15", b2c: 150_000, b2b: 0 });
    expect(data.trend.points.find((p) => p.date === "2026-09-16")).toEqual({ date: "2026-09-16", b2c: 0, b2b: 300_000 });
    expect(data.trend.points.find((p) => p.date === "2026-09-17")).toEqual({ date: "2026-09-17", b2c: 0, b2b: 0 });
    expect(data.trend.points.find((p) => p.date === "2026-09-20")).toEqual({ date: "2026-09-20", b2c: 70_000, b2b: 0 });
  });

  it("splits B2B and B2C with their order counts", () => {
    expect(data.split).toEqual({ b2c: { revenue: 220_000, orders: 2 }, b2b: { revenue: 300_000, orders: 1 } });
  });

  it("ranks categories and products by revenue", () => {
    expect(data.topCategories).toEqual([{ key: "rings", name: "Rings", revenue: 470_000, units: 5 }, { key: "necklaces", name: "Necklaces", revenue: 50_000, units: 1 }]);
    expect(data.topProducts.map((p) => [p.name, p.revenue, p.units])).toEqual([["Solitaire Ring", 400_000, 4], ["Band", 70_000, 1], ["Haar", 50_000, 1]]);
  });

  it("keeps only the top five and breaks ties by name", () => {
    const many = Array.from({ length: 8 }, (_, i) => fact({ orderId: `t${i}`, revenue: 1_000, productKey: `k${i}`, productName: `Item ${String.fromCharCode(72 - i)}` }));
    const top = aggregateSales(many, ctx()).topProducts;
    expect(top).toHaveLength(5);
    expect(top.map((p) => p.name)).toEqual(["Item A", "Item B", "Item C", "Item D", "Item E"]);
  });

  it("excludes another branch, and the whole business includes it", () => {
    expect(aggregateSales(FACTS, ctx()).revenue.value).toBe(520_000 + 999);
    expect(aggregateSales(FACTS, ctx({ branchId: "b2" })).revenue.value).toBe(999);
  });

  it("filters to one location", () => {
    expect(aggregateSales(FACTS, ctx({ branchId: "b1", locationId: "l1" })).revenue.value).toBe(450_000); // without o3 (l2)
    expect(aggregateSales(FACTS, ctx({ branchId: "b1", locationId: "l2" })).revenue.value).toBe(70_000);
  });

  it("says 'nothing to compare' (null), not zero, when the previous period had no sales", () => {
    const onlyNow = aggregateSales(FACTS.filter((f) => f.orderId !== "o4" && f.orderId !== "o5"), ctx({ branchId: "b1" }));
    expect(onlyNow.revenue.previous).toBeNull();
    expect(onlyNow.orders.previous).toBeNull();
    expect(onlyNow.grossMargin).toMatchObject({ previous: null });
  });

  it("returns honest zeros — and no margin percent — when nothing was sold", () => {
    const none = aggregateSales([], ctx());
    expect(none.revenue).toEqual({ value: 0, previous: null });
    expect(none.orders.value).toBe(0);
    expect(none.grossMargin).toEqual({ restricted: false, value: 0, previous: null, percentage: null });
    expect(none.topProducts).toEqual([]);
    expect(none.trend.points.every((p) => p.b2c === 0 && p.b2b === 0)).toBe(true);
  });

  it("honours the business-day boundary: 23:59 IST is in, 00:01 IST the next day is out", () => {
    const edge = [
      fact({ orderId: "in", at: new Date("2026-09-20T18:29:00Z"), revenue: 5 }), // 23:59 IST on the 20th
      fact({ orderId: "out", at: new Date("2026-09-20T18:31:00Z"), revenue: 7 }), // 00:01 IST on the 21st
    ];
    expect(aggregateSales(edge, ctx()).revenue.value).toBe(5);
    expect(aggregateSales(edge, ctx()).trend.points.at(-1)).toMatchObject({ date: "2026-09-20", b2c: 5 });
  });

  it("uses weekly buckets for a long range", () => {
    const long = aggregateSales(FACTS, ctx({ branchId: "b1" }, { from: "2026-07-01", to: "2026-09-20" }));
    expect(long.trend.granularity).toBe("week");
    expect(long.trend.points.at(-1)!.date).toBe("2026-09-14");
    expect(long.trend.points.reduce((t, p) => t + p.b2c + p.b2b, 0)).toBe(long.revenue.value);
  });

  it("is deterministic and leaves its input alone", () => {
    const frozen = Object.freeze(FACTS.map((f) => Object.freeze({ ...f })));
    expect(aggregateSales(frozen, ctx({ branchId: "b1" }))).toEqual(data);
  });

  it("makes the trend, split and KPIs agree", () => {
    expect(data.trend.points.reduce((t, p) => t + p.b2c + p.b2b, 0)).toBe(data.revenue.value);
    expect(data.split.b2c.revenue + data.split.b2b.revenue).toBe(data.revenue.value);
    expect(data.b2cRevenue.value + data.b2bRevenue.value).toBe(data.revenue.value);
  });
});
