"use client";

import type { UseQueryResult } from "@tanstack/react-query";
import { BarChart3 } from "lucide-react";
import type { DashboardSection, SalesData, SalesRankEntry } from "@jewellery/types";
import { BarList, EmptyState, Skeleton, SplitBar, TrendChart, formatCompactCurrency, formatCurrency, formatNumber } from "@jewellery/ui";
import { changeVs } from "../../lib/dashboard/format";
import { formatDay, formatDayLong } from "../../lib/dashboard/range";
import { rupees } from "../../lib/inventory/format";
import { ChangeBadge } from "./change";
import { Section } from "./section";

type Q = UseQueryResult<DashboardSection<SalesData>>;
const compact = (paise: number) => formatCompactCurrency(rupees(paise));
const exact = (paise: number) => formatCurrency(rupees(paise));
const NO_SALES = <EmptyState icon={<BarChart3 className="h-7 w-7" aria-hidden="true" />} title="No sales in this period" description="Try a wider date range, or another branch or location." className="py-8" />;

export function RevenueTrend({ query }: { query: Q }) {
  return (
    <Section title="Revenue trend" description="B2C and B2B, before GST" query={query} skeleton={<Skeleton className="h-64" />} testId="revenue-trend">
      {(d) => {
        if (d.orders.value === 0) return NO_SALES;
        const change = changeVs(d.revenue.value, d.revenue.previous);
        return (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="tabular text-h3 font-display text-foreground" data-testid="trend-total">{exact(d.revenue.value)}</span>
              {change && <ChangeBadge change={change} />}
              <span className="text-caption text-muted">{d.trend.granularity === "day" ? "Daily" : "Weekly"} totals</span>
            </div>
            <TrendChart
              points={d.trend.points.map((p) => ({ key: p.date, label: d.trend.granularity === "week" ? `Week of ${formatDay(p.date)}` : formatDayLong(p.date), tick: formatDay(p.date), values: [p.b2c, p.b2b] }))}
              series={[{ key: "b2c", label: "B2C", tone: "primary" }, { key: "b2b", label: "B2B", tone: "info" }]}
              formatValue={(v) => exact(v)}
              formatAxis={(v) => compact(v)}
            />
          </div>
        );
      }}
    </Section>
  );
}

export function ChannelSplit({ query }: { query: Q }) {
  return (
    <Section title="B2B vs B2C" description="Share of revenue" query={query} skeleton={<Skeleton className="h-40" />} testId="channel-split">
      {(d) =>
        d.split.b2c.orders === 0 && d.split.b2b.orders === 0 ? NO_SALES : (
          <SplitBar
            segments={[
              { key: "b2c", label: "B2C", value: d.split.b2c.revenue, valueLabel: compact(d.split.b2c.revenue), detail: `${formatNumber(d.split.b2c.orders)} orders`, tone: "primary" },
              { key: "b2b", label: "B2B", value: d.split.b2b.revenue, valueLabel: compact(d.split.b2b.revenue), detail: `${formatNumber(d.split.b2b.orders)} orders`, tone: "info" },
            ]}
          />
        )
      }
    </Section>
  );
}

function Ranking({ title, description, query, pick, testId }: { title: string; description: string; query: Q; pick: (d: SalesData) => SalesRankEntry[]; testId: string }) {
  return (
    <Section title={title} description={description} query={query} skeleton={<Skeleton className="h-40" />} testId={testId}>
      {(d) => {
        const rows = pick(d);
        return rows.length === 0 ? NO_SALES : (
          <BarList
            tone="neutral"
            aria-label={title}
            items={rows.map((r) => ({ key: r.key, label: r.name, value: r.revenue, valueLabel: compact(r.revenue), secondary: `${formatNumber(r.units)} ${r.units === 1 ? "unit" : "units"}` }))}
          />
        );
      }}
    </Section>
  );
}

export const TopCategories = ({ query }: { query: Q }) => <Ranking title="Top categories" description="By revenue" query={query} pick={(d) => d.topCategories} testId="top-categories" />;
export const TopProducts = ({ query }: { query: Q }) => <Ranking title="Top products" description="By revenue" query={query} pick={(d) => d.topProducts} testId="top-products" />;
