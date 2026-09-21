"use client";

import Link from "next/link";
import type { UseQueryResult } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, ChevronRight, Info, XCircle } from "lucide-react";
import type { DashboardAlert, DashboardSection } from "@jewellery/types";
import { Skeleton } from "@jewellery/ui";
import { Section } from "./section";

const ICON = { critical: XCircle, warning: AlertTriangle, info: Info } as const;
const TONE = { critical: "text-danger bg-danger-subtle", warning: "text-warning bg-warning-subtle", info: "text-info bg-info-subtle" } as const;

function Row({ alert }: { alert: DashboardAlert }) {
  const Icon = ICON[alert.severity];
  return (
    <li>
      <Link href={alert.href} className="group -mx-2 flex items-start gap-3 rounded-md px-2 py-2.5 transition-colors hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" data-testid={`alert-${alert.id}`}>
        <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${TONE[alert.severity]}`}><Icon className="h-4 w-4" aria-hidden="true" /></span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-body-sm font-medium text-foreground">{alert.title}</span>
          <span className="text-caption text-muted">{alert.detail}</span>
        </span>
        <ChevronRight className="mt-1.5 h-4 w-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
      </Link>
    </li>
  );
}

/** What needs a person right now, most urgent first, each row a link to the screen that resolves it. Nothing to show is a good answer, and says so. */
export function AttentionPanel({ query }: { query: UseQueryResult<DashboardSection<DashboardAlert[]>> }) {
  return (
    <Section
      title="Needs attention"
      description="From live stock, transfers and approvals"
      query={query}
      skeleton={<div className="flex flex-col gap-3"><Skeleton className="h-12" /><Skeleton className="h-12" /><Skeleton className="h-12" /></div>}
      testId="attention"
    >
      {(alerts) =>
        alerts.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center" data-testid="attention-empty">
            <CheckCircle2 className="h-8 w-8 text-success" aria-hidden="true" />
            <p className="text-body font-medium text-foreground">Nothing needs attention</p>
            <p className="text-body-sm text-muted">No overdue transfers, lapsed reservations or pending approvals.</p>
          </div>
        ) : (
          <ul className="flex flex-col divide-y divide-border-subtle" aria-label="Items needing attention">
            {alerts.map((a) => <Row key={a.id} alert={a} />)}
          </ul>
        )
      }
    </Section>
  );
}
