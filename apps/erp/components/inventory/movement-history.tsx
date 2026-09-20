"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { LedgerRow } from "@jewellery/types";
import { Alert, Button, EmptyState, InventoryStatusBadge, Skeleton, formatWeight } from "@jewellery/ui";
import { useLedger } from "../../lib/api/inventory-queries";
import { MOVEMENT_LABELS, shortId } from "../../lib/inventory/format";

const when = new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const signed = (n: number, fmt: (v: number) => string) => `${n > 0 ? "+" : "−"}${fmt(Math.abs(n))}`;

/** The append-only trail for one piece, newest first — every state it has been in and who put it there. */
export function MovementHistory({ itemId }: { itemId: string }) {
  const ledger = useLedger({ itemId, order: "desc", page: 1, pageSize: 100 } as never);
  if (ledger.isLoading) return <div className="flex flex-col gap-2"><Skeleton className="h-16" /><Skeleton className="h-16" /></div>;
  if (ledger.isError) return <Alert variant="danger" title="Couldn't load history"><Button size="sm" variant="secondary" onClick={() => ledger.refetch()}>Retry</Button></Alert>;
  const rows = ledger.data?.rows ?? [];
  if (!rows.length) return <EmptyState title="No movements recorded" description="This piece was created outside the ledger." className="py-8" />;

  return (
    <ol className="flex flex-col" aria-label="Movement history">
      {rows.map((r: LedgerRow, i) => (
        <li key={r.id} className="relative flex gap-3 pb-5 last:pb-0" data-testid="ledger-entry">
          {i < rows.length - 1 && <span className="absolute left-[7px] top-4 h-full w-px bg-border" aria-hidden="true" />}
          <span className="z-10 mt-1 h-3.5 w-3.5 shrink-0 rounded-full border-2 border-primary bg-surface" aria-hidden="true" />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <span className="font-medium text-foreground"><span className="mr-1.5 text-caption text-muted">#{r.sequence}</span>{MOVEMENT_LABELS[r.movementType]}</span>
              <time className="text-caption text-muted" dateTime={String(r.createdAt)}>{when.format(new Date(r.createdAt))}</time>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-body-sm">
              {r.fromStatus ? <><InventoryStatusBadge status={r.fromStatus} /><ArrowRight className="h-3.5 w-3.5 text-muted" aria-hidden="true" /></> : null}
              <InventoryStatusBadge status={r.toStatus} />
              {r.destinationLocation && (
                <span className="text-muted">
                  {r.sourceLocation && r.sourceLocation.id !== r.destinationLocation.id ? `${r.sourceLocation.name} → ` : "at "}
                  <span className="text-foreground">{r.destinationLocation.name}</span>
                </span>
              )}
            </div>
            {(r.grossWeight !== 0 && i < rows.length - 1) || r.quantity > 1 ? (
              <p className="text-body-sm text-muted">
                {r.grossWeight !== 0 && signed(r.grossWeight, (v) => formatWeight(v))} {r.fineWeight !== 0 && <>· fine {signed(r.fineWeight, (v) => formatWeight(v))}</>}
              </p>
            ) : null}
            <p className="text-caption text-muted">
              by {r.performedBy.name}
              {r.reason && <> · “{r.reason}”</>}
              {r.referenceId && <> · {r.referenceType.replace(/_/g, " ").toLowerCase()} …{shortId(r.referenceId)}</>}
              {" · "}balance {formatWeight(r.balanceAfter.grossWeight)}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}

export const LedgerLink = ({ itemId }: { itemId: string }) => (
  <Link href={`/inventory/ledger?itemId=${itemId}`} className="text-body-sm text-primary-active hover:underline">Open in ledger</Link>
);
