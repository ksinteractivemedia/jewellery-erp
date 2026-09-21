"use client";

import Link from "next/link";
import type { UseQueryResult } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import type { DashboardSection, OperationsDashboard, OperationsQueue } from "@jewellery/types";
import { Badge, Skeleton } from "@jewellery/ui";
import { daysLabel, plural } from "../../lib/dashboard/format";
import { Section } from "./section";

type Q = UseQueryResult<DashboardSection<OperationsDashboard>>;
const skeleton = <div className="flex flex-col gap-2"><Skeleton className="h-9 w-16" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-4/5" /><Skeleton className="h-4 w-3/5" /></div>;

function Head({ count, unit, overdue, limitDays }: { count: number; unit: string; overdue: number; limitDays: number }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
      <span className="tabular text-h2 font-display text-foreground" data-testid="queue-count">{count}</span>
      <span className="text-body-sm text-muted">{count === 1 ? unit : `${unit}s`}</span>
      {overdue > 0 && <Badge variant="warning" data-testid="queue-overdue">{overdue} over {limitDays} days</Badge>}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="py-2 text-body-sm text-muted">{text}</p>;
}

function ViewAll({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="mt-auto inline-flex items-center gap-1 pt-1 text-body-sm font-medium text-primary-active hover:underline">
      {label}<ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
    </Link>
  );
}

function PieceQueue({ query, title, description, pick, status, empty, testId }: { query: Q; title: string; description: string; pick: (o: OperationsDashboard) => OperationsQueue; status: string; empty: string; testId: string }) {
  return (
    <Section title={title} description={description} query={query} skeleton={skeleton} testId={testId} className="h-full" showScope={false}>
      {(ops) => {
        const q = pick(ops);
        return (
          <div className="flex h-full flex-col gap-3">
            <Head count={q.pieces} unit="piece" overdue={q.overdue} limitDays={ops.thresholds.partnerDays} />
            {q.oldest.length === 0 ? (
              <Empty text={empty} />
            ) : (
              <ul className="flex flex-col gap-2" aria-label={`Longest waiting — ${title}`}>
                {q.oldest.slice(0, 4).map((r) => (
                  <li key={r.itemId}>
                    <Link href={`/inventory/stock/${r.itemId}`} className="flex flex-col rounded-md px-2 py-1 -mx-2 transition-colors hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="truncate font-mono text-body-sm text-foreground">{r.itemCode}</span>
                        <span className={`shrink-0 text-caption tabular ${r.days >= ops.thresholds.partnerDays ? "font-medium text-warning" : "text-muted"}`}>{daysLabel(r.days)}</span>
                      </span>
                      <span className="truncate text-caption text-muted">{[r.productName, r.location].filter(Boolean).join(" · ")}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {q.pieces > 4 && <p className="text-caption text-muted">+ {q.pieces - Math.min(4, q.oldest.length)} more</p>}
            <ViewAll href={`/inventory/stock?status=${status}`} label="View all" />
          </div>
        );
      }}
    </Section>
  );
}

export const JobWorkQueue = ({ query }: { query: Q }) => <PieceQueue query={query} title="Pending job work" description="Pieces with job workers" pick={(o) => o.jobWork} status="WITH_JOB_WORKER" empty="Nothing is out with a job worker." testId="queue-jobwork" />;
export const HallmarkingQueue = ({ query }: { query: Q }) => <PieceQueue query={query} title="Pending hallmarking" description="Pieces at hallmarking" pick={(o) => o.hallmarking} status="HALLMARKING" empty="Nothing is at hallmarking." testId="queue-hallmarking" />;
export const RepairQueue = ({ query }: { query: Q }) => <PieceQueue query={query} title="Repairs" description="Pieces under repair" pick={(o) => o.repairs} status="UNDER_REPAIR" empty="Nothing is under repair." testId="queue-repairs" />;

export function TransferQueue({ query }: { query: Q }) {
  return (
    <Section title="Transfers in transit" description="Dispatched, not yet received" query={query} skeleton={skeleton} testId="queue-transfers" className="h-full" showScope={false}>
      {(ops) => {
        const t = ops.transfers;
        return (
          <div className="flex h-full flex-col gap-3">
            <Head count={t.inTransit} unit="transfer" overdue={t.overdue} limitDays={ops.thresholds.transitDays} />
            {t.oldest.length === 0 ? (
              <Empty text="No transfers are on the road." />
            ) : (
              <ul className="flex flex-col gap-2" aria-label="Longest in transit">
                {t.oldest.slice(0, 4).map((r) => (
                  <li key={r.id}>
                    <Link href="/inventory/transfers" className="flex flex-col rounded-md px-2 py-1 -mx-2 transition-colors hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="truncate font-mono text-body-sm text-foreground">{r.transferNo}</span>
                        <span className={`shrink-0 text-caption tabular ${r.days >= ops.thresholds.transitDays ? "font-medium text-warning" : "text-muted"}`}>{daysLabel(r.days)}</span>
                      </span>
                      <span className="truncate text-caption text-muted">{r.from} → {r.to} · {plural(r.pieces, "piece")}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <ViewAll href="/inventory/transfers" label="View transfers" />
          </div>
        );
      }}
    </Section>
  );
}
