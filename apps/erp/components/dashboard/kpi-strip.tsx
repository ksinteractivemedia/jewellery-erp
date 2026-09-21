"use client";

import * as React from "react";
import type { UseQueryResult } from "@tanstack/react-query";
import { Banknote, Lock, Package, Percent, PlugZap, Users, Wallet } from "lucide-react";
import type { B2BData, DashboardSection, SalesData } from "@jewellery/types";
import { Card, Skeleton, formatCompactCurrency, formatCurrency, formatNumber } from "@jewellery/ui";
import { changeVs } from "../../lib/dashboard/format";
import { rupees } from "../../lib/inventory/format";
import { ChangeBadge } from "./change";
import { SampleBadge } from "./section";

const compact = (paise: number) => formatCompactCurrency(rupees(paise));
const exact = (paise: number) => formatCurrency(rupees(paise), { precise: true });

interface Tile {
  key: string;
  label: string;
  icon: React.ReactNode;
  query: UseQueryResult<DashboardSection<unknown>>;
  /** Called only when the section is available. */
  render: (data: never) => { value: string; title?: string; caption?: React.ReactNode; change?: ReturnType<typeof changeVs>; restricted?: boolean };
}

function KpiTile({ tile }: { tile: Tile }) {
  const { query } = tile;
  const section = query.data;
  let body: React.ReactNode;
  if (query.isPending) {
    body = (
      <>
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-4 w-32" />
      </>
    );
  } else if (query.isError && !section) {
    body = <span className="text-body-sm text-danger" data-testid={`kpi-${tile.key}-error`}>Couldn’t load</span>;
  } else if (section?.status === "NOT_CONNECTED") {
    body = (
      <>
        <span className="tabular text-h2 font-display text-muted" aria-label="No data">—</span>
        <span className="inline-flex items-center gap-1 text-caption text-muted"><PlugZap className="h-3 w-3" aria-hidden="true" />Not connected yet</span>
      </>
    );
  } else if (section?.status === "OK") {
    const shown = tile.render(section.data as never);
    body = shown.restricted ? (
      <>
        <span className="inline-flex items-center gap-1.5 text-body text-muted"><Lock className="h-4 w-4" aria-hidden="true" />Restricted</span>
        <span className="text-caption text-muted">Needs financial access</span>
      </>
    ) : (
      <>
        <span className="tabular text-h2 font-display text-foreground" title={shown.title} data-testid={`kpi-${tile.key}-value`}>{shown.value}</span>
        <div className="flex min-h-4 flex-wrap items-center gap-x-2 gap-y-0.5">
          {shown.change && <ChangeBadge change={shown.change} />}
          {shown.caption && <span className="text-caption text-muted">{shown.caption}</span>}
        </div>
      </>
    );
  }
  const sample = section?.status === "OK" && section.provenance === "SAMPLE";
  return (
    <Card className={`flex flex-col gap-1.5 p-4 ${query.isPlaceholderData ? "opacity-60 transition-opacity" : ""}`} data-testid={`kpi-${tile.key}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-body-sm text-muted">{tile.label}</span>
        <span className="flex items-center gap-1.5 text-muted">{sample && <SampleBadge compact />}<span aria-hidden="true">{tile.icon}</span></span>
      </div>
      {body}
    </Card>
  );
}

const sales = (query: UseQueryResult<DashboardSection<SalesData>>) => query as UseQueryResult<DashboardSection<unknown>>;

/**
 * The six figures that matter most, each in its own state: while loading, when its module doesn't exist yet,
 * when the caller may not see it (margin), or with a change against the previous period. A tile is omitted
 * entirely when the caller has no permission for its section. Every number is the API's; this only formats.
 */
export function KpiStrip({ salesQuery, b2bQuery }: { salesQuery: UseQueryResult<DashboardSection<SalesData>> | null; b2bQuery: UseQueryResult<DashboardSection<B2BData>> | null }) {
  const tiles: Tile[] = [];
  if (salesQuery) {
    const q = sales(salesQuery);
    tiles.push(
      { key: "today", label: "Today’s revenue", icon: <Banknote className="h-4 w-4" />, query: q, render: (d: SalesData) => ({ value: compact(d.todayRevenue), title: exact(d.todayRevenue), caption: "before GST" }) },
      { key: "b2c", label: "B2C revenue", icon: <Users className="h-4 w-4" />, query: q, render: (d: SalesData) => ({ value: compact(d.b2cRevenue.value), title: exact(d.b2cRevenue.value), change: changeVs(d.b2cRevenue.value, d.b2cRevenue.previous) }) },
      { key: "b2b", label: "B2B revenue", icon: <Users className="h-4 w-4" />, query: q, render: (d: SalesData) => ({ value: compact(d.b2bRevenue.value), title: exact(d.b2bRevenue.value), change: changeVs(d.b2bRevenue.value, d.b2bRevenue.previous) }) },
      {
        key: "margin", label: "Gross margin", icon: <Percent className="h-4 w-4" />, query: q,
        render: (d: SalesData) => d.grossMargin.restricted
          ? { value: "", restricted: true }
          : { value: compact(d.grossMargin.value), title: exact(d.grossMargin.value), change: changeVs(d.grossMargin.value, d.grossMargin.previous), caption: d.grossMargin.percentage === null ? undefined : `${d.grossMargin.percentage.toFixed(1)}% of revenue` },
      },
      { key: "orders", label: "Orders", icon: <Package className="h-4 w-4" />, query: q, render: (d: SalesData) => ({ value: formatNumber(d.orders.value), change: changeVs(d.orders.value, d.orders.previous) }) },
    );
  }
  if (b2bQuery) {
    tiles.push({
      key: "receivables", label: "Outstanding receivables", icon: <Wallet className="h-4 w-4" />, query: b2bQuery as UseQueryResult<DashboardSection<unknown>>,
      render: (d: B2BData) => ({ value: compact(d.outstanding), title: exact(d.outstanding), caption: d.overdue.amount > 0 ? <span className="text-danger">{compact(d.overdue.amount)} overdue</span> : "none overdue" }),
    });
  }
  if (tiles.length === 0) return null;
  return (
    <section aria-label="Key figures" className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6" data-testid="kpi-strip">
      {tiles.map((t) => <KpiTile key={t.key} tile={t} />)}
    </section>
  );
}
