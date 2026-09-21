"use client";

import * as React from "react";
import Link from "next/link";
import type { UseQueryResult } from "@tanstack/react-query";
import { Boxes } from "lucide-react";
import type { DashboardSection, InventoryDashboard, StockBreakdownRow } from "@jewellery/types";
import { BarList, EmptyState, Skeleton, Tabs, TabsList, TabsTrigger, formatCompactCurrency, formatNumber, formatWeight } from "@jewellery/ui";
import { rupees } from "../../lib/inventory/format";
import { Section } from "./section";

type Q = UseQueryResult<DashboardSection<InventoryDashboard>>;
const compact = (paise: number) => formatCompactCurrency(rupees(paise));

function Stat({ label, value, sub, href, testId }: { label: string; value: string; sub?: React.ReactNode; href?: string; testId: string }) {
  const inner = (
    <>
      <span className="text-body-sm text-muted">{label}</span>
      <span className="tabular text-h3 font-display text-foreground" data-testid={`${testId}-value`}>{value}</span>
      {sub && <span className="text-caption text-muted">{sub}</span>}
    </>
  );
  const cls = "flex min-w-0 flex-col gap-0.5 px-4 py-3";
  return href ? <Link href={href} className={`${cls} transition-colors hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`} data-testid={testId}>{inner}</Link> : <div className={cls} data-testid={testId}>{inner}</div>;
}

const weights = (row?: StockBreakdownRow) => (row ? `${formatWeight(row.netWeight)} net · ${formatNumber(row.pieces)} ${row.pieces === 1 ? "piece" : "pieces"}` : "no stock");

/** Stock position in one card — five figures, not five cards. */
export function StockPosition({ query }: { query: Q }) {
  return (
    <Section title="Stock position" description="Everything still owned, wherever it is" query={query} skeleton={<Skeleton className="h-24" />} testId="stock-position">
      {(inv) => {
        const gold = inv.metals.find((m) => m.code === "GOLD");
        const silver = inv.metals.find((m) => m.code === "SILVER");
        const v = inv.stockValue;
        return (
          <div className="-mx-1 grid grid-cols-2 divide-border-subtle md:grid-cols-3 md:divide-x xl:grid-cols-5">
            <Stat testId="stat-gold" label="Gold stock" value={formatWeight(gold?.fineWeight ?? 0)} sub={<>fine · {weights(gold)}</>} />
            <Stat testId="stat-silver" label="Silver stock" value={formatWeight(silver?.fineWeight ?? 0)} sub={<>fine · {weights(silver)}</>} />
            <Stat testId="stat-available" label="Available pieces" value={formatNumber(inv.availablePieces)} sub="finished jewellery ready to sell" href="/inventory/stock?availableForSale=true" />
            <Stat testId="stat-reserved" label="Reserved stock" value={formatNumber(inv.reserved.pieces)} sub={`${formatWeight(inv.reserved.fineWeight)} fine held for orders`} href="/inventory/stock?status=RESERVED" />
            <Stat
              testId="stat-value"
              label="Stock value"
              value={compact(v.cost)}
              sub={v.metalValue === null ? "at cost · no metal rates on file" : <>at cost · metal at today’s rate {compact(v.metalValue)}{v.metalValueMissingFor.length > 0 && <> (excl. {v.metalValueMissingFor.join(", ")}: no rate)</>}</>}
            />
          </div>
        );
      }}
    </Section>
  );
}

type Basis = "value" | "pieces";
const LIMIT = 8;
/** Descending order by comparison — display order, not arithmetic on a money figure. */
const descending = (a: number, b: number) => (b > a ? 1 : b < a ? -1 : 0);

function Breakdown({ query, title, description, pick, basis, testId }: { query: Q; title: string; description: string; pick: (d: InventoryDashboard) => StockBreakdownRow[]; basis: Basis; testId: string }) {
  return (
    <Section title={title} description={description} query={query} skeleton={<Skeleton className="h-40" />} testId={testId}>
      {(inv) => {
        const rows = pick(inv);
        if (rows.length === 0) return <EmptyState icon={<Boxes className="h-7 w-7" aria-hidden="true" />} title="No stock here" description="Nothing owned matches this branch or location." className="py-6" />;
        const sorted = [...rows].sort((a, b) => descending(basis === "value" ? a.cost : a.pieces, basis === "value" ? b.cost : b.pieces) || a.label.localeCompare(b.label));
        const shown = sorted.slice(0, LIMIT);
        return (
          <div className="flex flex-col gap-3">
            <BarList
              tone="info"
              aria-label={title}
              items={shown.map((r) => ({
                key: r.key,
                label: r.label,
                sublabel: r.sublabel,
                value: basis === "value" ? r.cost : r.pieces,
                valueLabel: basis === "value" ? compact(r.cost) : `${formatNumber(r.pieces)} pcs`,
                secondary: basis === "value" ? `${formatNumber(r.pieces)} pcs · ${formatWeight(r.fineWeight)} fine` : `${compact(r.cost)} · ${formatWeight(r.fineWeight)} fine`,
              }))}
            />
            {sorted.length > LIMIT && <p className="text-caption text-muted">+ {sorted.length - LIMIT} more</p>}
          </div>
        );
      }}
    </Section>
  );
}

/** Stock by location, metal and purity, drawn on the same basis (book value or pieces) so the three can be read together. */
export function StockBreakdowns({ query }: { query: Q }) {
  const [basis, setBasis] = React.useState<Basis>("value");
  return (
    <div className="flex flex-col gap-3" data-testid="stock-breakdowns">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-body font-medium text-foreground">Where the stock is</h2>
        <Tabs value={basis} onValueChange={(v) => setBasis(v as Basis)}>
          <TabsList aria-label="Measure stock by" className="border-b-0">
            <TabsTrigger value="value">Book value</TabsTrigger>
            <TabsTrigger value="pieces">Pieces</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <Breakdown query={query} title="Stock by location" description="Owned stock" pick={(d) => d.byLocation} basis={basis} testId="stock-by-location" />
        <Breakdown query={query} title="Stock by metal" description="Owned stock" pick={(d) => d.byMetal} basis={basis} testId="stock-by-metal" />
        <Breakdown query={query} title="Stock by purity" description="Owned stock" pick={(d) => d.byPurity} basis={basis} testId="stock-by-purity" />
      </div>
    </div>
  );
}
