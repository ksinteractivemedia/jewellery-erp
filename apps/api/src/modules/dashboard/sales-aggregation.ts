import type { SalesData, SalesKpi, SalesRankEntry } from "@jewellery/types";
import type { DashboardContext, SalesFact } from "./providers";
import { addDays, bucketKeys, bucketOf, businessDay, dayStart, granularityFor, previousRange, type ResolvedRange } from "./range";

const sum = (facts: SalesFact[], f: (x: SalesFact) => number) => facts.reduce((t, x) => t + f(x), 0);
const orderCount = (facts: SalesFact[]) => new Set(facts.map((f) => f.orderId)).size;
/** Basis points → percent with 2 decimals, half away from zero, in integers (no float drift in a money ratio). */
const percent = (part: number, whole: number): number | null => (whole === 0 ? null : Math.round((part * 10_000) / whole) / 100);

function rank(facts: SalesFact[], key: (f: SalesFact) => [string, string], limit = 5): SalesRankEntry[] {
  const groups = new Map<string, SalesRankEntry>();
  for (const f of facts) {
    const [k, name] = key(f);
    const g = groups.get(k) ?? { key: k, name, revenue: 0, units: 0 };
    g.revenue += f.revenue;
    g.units += f.units;
    groups.set(k, g);
  }
  return [...groups.values()].sort((a, b) => b.revenue - a.revenue || a.name.localeCompare(b.name)).slice(0, limit);
}

/**
 * Turns normalised order lines into everything the sales section shows. Pure: same facts and filters, same
 * numbers. Branch/location filters narrow the facts first; every KPI is then compared with the equally long
 * period before it (`previous` is null when that period holds no sales at all — "nothing to compare", not a zero).
 * Margin is returned unredacted; whether a caller may see it is the service's decision, not this function's.
 */
export function aggregateSales(all: readonly SalesFact[], ctx: DashboardContext): SalesData {
  const facts = all.filter((f) => (!ctx.branchId || f.branchId === ctx.branchId) && (!ctx.locationId || f.locationId === ctx.locationId));
  const within = (r: ResolvedRange) => facts.filter((f) => f.at >= r.start && f.at < r.end);
  const current = within(ctx.range);
  const prevRange = previousRange(ctx.range);
  const previous = within(prevRange);
  const comparable = previous.length > 0;

  const kpi = (f: (x: SalesFact[]) => number): SalesKpi => ({ value: f(current), previous: comparable ? f(previous) : null });
  const channel = (c: "B2C" | "B2B") => (x: SalesFact[]) => x.filter((f) => f.channel === c);

  const today = businessDay(ctx.now);
  const todayRevenue = sum(facts.filter((f) => f.at >= dayStart(today) && f.at < dayStart(addDays(today, 1))), (f) => f.revenue);

  const granularity = granularityFor(ctx.range);
  const buckets = new Map(bucketKeys(ctx.range, granularity).map((k) => [k, { date: k, b2c: 0, b2b: 0 }]));
  for (const f of current) {
    const bucket = buckets.get(bucketOf(businessDay(f.at), granularity));
    if (bucket) bucket[f.channel === "B2C" ? "b2c" : "b2b"] += f.revenue;
  }

  const margin = (x: SalesFact[]) => sum(x, (f) => f.revenue - f.cost);
  const revenue = sum(current, (f) => f.revenue);
  const b2c = channel("B2C")(current);
  const b2b = channel("B2B")(current);

  return {
    todayRevenue,
    revenue: kpi((x) => sum(x, (f) => f.revenue)),
    b2cRevenue: kpi((x) => sum(channel("B2C")(x), (f) => f.revenue)),
    b2bRevenue: kpi((x) => sum(channel("B2B")(x), (f) => f.revenue)),
    orders: kpi(orderCount),
    grossMargin: { restricted: false, value: margin(current), previous: comparable ? margin(previous) : null, percentage: percent(margin(current), revenue) },
    trend: { granularity, points: [...buckets.values()] },
    split: { b2c: { revenue: sum(b2c, (f) => f.revenue), orders: orderCount(b2c) }, b2b: { revenue: sum(b2b, (f) => f.revenue), orders: orderCount(b2b) } },
    topCategories: rank(current, (f) => [f.categoryKey, f.categoryName]),
    topProducts: rank(current, (f) => [f.productKey, f.productName]),
  };
}
