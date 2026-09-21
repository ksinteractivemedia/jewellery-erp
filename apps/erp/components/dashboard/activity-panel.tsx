"use client";

import Link from "next/link";
import type { UseQueryResult } from "@tanstack/react-query";
import { ArrowRight, History } from "lucide-react";
import type { ActivityData, DashboardSection } from "@jewellery/types";
import { EmptyState, Skeleton } from "@jewellery/ui";
import { plural, timeAgo } from "../../lib/dashboard/format";
import { MOVEMENT_LABELS } from "../../lib/inventory/format";
import { Section } from "./section";

/** The latest stock movements in the range and scope, read from the immutable ledger. */
export function ActivityPanel({ query }: { query: UseQueryResult<DashboardSection<ActivityData>> }) {
  return (
    <Section title="Recent activity" description="Latest stock movements" query={query} skeleton={<div className="flex flex-col gap-3">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-9" />)}</div>} testId="activity">
      {(data) =>
        data.rows.length === 0 ? (
          <EmptyState icon={<History className="h-7 w-7" aria-hidden="true" />} title="No stock movements in this period" description="Receipts, transfers, reservations and sales appear here as they happen." className="py-8" />
        ) : (
          <div className="flex flex-col gap-3">
            <ul className="flex flex-col divide-y divide-border-subtle" aria-label="Recent stock movements">
              {data.rows.map((r) => (
                <li key={r.id} className="flex items-start justify-between gap-3 py-2" data-testid="activity-row">
                  <div className="flex min-w-0 flex-col">
                    <span className="text-body-sm text-foreground">
                      {MOVEMENT_LABELS[r.movementType]} · <Link href={`/inventory/stock/${r.itemId}`} className="font-mono text-primary-active hover:underline">{r.itemCode}</Link>
                    </span>
                    <span className="truncate text-caption text-muted">{[r.productName, r.from && r.to && r.from !== r.to ? `${r.from} → ${r.to}` : (r.to ?? r.from), r.actor].filter(Boolean).join(" · ")}</span>
                  </div>
                  <time dateTime={r.at} className="shrink-0 text-caption text-muted" title={new Date(r.at).toLocaleString("en-IN")}>{timeAgo(r.at, Date.now())}</time>
                </li>
              ))}
            </ul>
            <div className="flex items-center justify-between gap-3 text-caption text-muted">
              <span>{plural(data.total, "movement")} in this period</span>
              <Link href="/inventory/ledger" className="inline-flex items-center gap-1 text-body-sm font-medium text-primary-active hover:underline">Open the ledger<ArrowRight className="h-3.5 w-3.5" aria-hidden="true" /></Link>
            </div>
          </div>
        )
      }
    </Section>
  );
}
