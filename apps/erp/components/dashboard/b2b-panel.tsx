"use client";

import type { UseQueryResult } from "@tanstack/react-query";
import type { B2BData, DashboardSection } from "@jewellery/types";
import { Meter, Skeleton, formatCompactCurrency, formatCurrency, formatNumber } from "@jewellery/ui";
import { plural } from "../../lib/dashboard/format";
import { rupees } from "../../lib/inventory/format";
import { Section } from "./section";

const compact = (paise: number) => formatCompactCurrency(rupees(paise));
const exact = (paise: number) => formatCurrency(rupees(paise), { precise: true });

function Stat({ label, value, sub, tone, title, testId }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: "danger"; title?: string; testId: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5" data-testid={testId}>
      <span className="text-body-sm text-muted">{label}</span>
      <span className={`tabular text-h3 font-display ${tone === "danger" ? "text-danger" : "text-foreground"}`} title={title} data-testid={`${testId}-value`}>{value}</span>
      {sub && <span className="text-caption text-muted">{sub}</span>}
    </div>
  );
}

/** Receivables and credit exposure of B2B customers, and what is waiting on a decision. */
export function B2BPanel({ query }: { query: UseQueryResult<DashboardSection<B2BData>> }) {
  return (
    <Section title="B2B position" description="Receivables, credit and pending documents" query={query} skeleton={<Skeleton className="h-40" />} testId="b2b-panel">
      {(d) => (
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-4">
            <Stat testId="b2b-pos" label="Pending POs" value={formatNumber(d.pendingPurchaseOrders.count)} sub={`${compact(d.pendingPurchaseOrders.value)} awaiting approval`} />
            <Stat testId="b2b-quotes" label="Pending quotations" value={formatNumber(d.pendingQuotations.count)} sub={`${compact(d.pendingQuotations.value)} awaiting a reply`} />
            <Stat testId="b2b-outstanding" label="Outstanding" value={compact(d.outstanding)} title={exact(d.outstanding)} sub="owed on invoices" />
            <Stat testId="b2b-overdue" label="Overdue" value={compact(d.overdue.amount)} title={exact(d.overdue.amount)} tone={d.overdue.amount > 0 ? "danger" : undefined} sub={d.overdue.invoices > 0 ? `${plural(d.overdue.invoices, "invoice")} · ${plural(d.overdue.customers, "customer")}` : "nothing overdue"} />
          </div>
          <div className="flex flex-col gap-2 border-t border-border-subtle pt-4" data-testid="b2b-credit">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-body-sm text-muted">Credit utilisation</span>
              <span className="tabular text-body font-medium text-foreground" data-testid="b2b-credit-value">{d.creditUtilization.percentage === null ? "No credit limits set" : `${d.creditUtilization.percentage.toFixed(1)}%`}</span>
            </div>
            {d.creditUtilization.percentage !== null && (
              <>
                <Meter value={d.creditUtilization.used} max={d.creditUtilization.limit} label="Credit used of total limit" />
                <span className="text-caption text-muted">{compact(d.creditUtilization.used)} used of {compact(d.creditUtilization.limit)} extended</span>
              </>
            )}
          </div>
        </div>
      )}
    </Section>
  );
}
