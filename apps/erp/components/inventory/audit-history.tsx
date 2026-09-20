"use client";

import { Alert, Button, EmptyState, Skeleton, StatusBadge } from "@jewellery/ui";
import { useItemAudit } from "../../lib/api/inventory-queries";

const when = new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const ACTIONS: Record<string, string> = {
  "inventory.item_received": "Received into stock",
  "inventory.identifiers_updated": "Identifiers updated",
  "inventory.reserved": "Reservation placed",
  "inventory.released": "Reservation released",
  "inventory.moved": "Moved to/from a partner",
  "inventory.return_inspected": "Return inspected",
  "inventory.transfer_dispatched": "Transfer dispatched",
  "inventory.transfer_received": "Transfer received",
  "inventory.transfer_cancelled": "Transfer cancelled",
  "inventory.adjustment_requested": "Adjustment requested",
  "inventory.adjustment_approved": "Adjustment approved",
  "inventory.adjustment_rejected": "Adjustment rejected",
};

/** Who did what, and from where — distinct from the ledger, which records what happened to the stock. */
export function AuditHistory({ itemId }: { itemId: string }) {
  const audit = useItemAudit(itemId);
  if (audit.isLoading) return <Skeleton className="h-24" />;
  if (audit.isError) return <Alert variant="danger" title="Couldn't load audit history"><Button size="sm" variant="secondary" onClick={() => audit.refetch()}>Retry</Button></Alert>;
  if (!audit.data?.length) return <EmptyState title="No audited actions yet" description="Actions taken through the ERP on this piece appear here." className="py-8" />;
  return (
    <ul className="flex flex-col divide-y divide-border-subtle" aria-label="Audit history">
      {audit.data.map((e) => (
        <li key={e.id} className="flex flex-wrap items-start justify-between gap-2 py-2.5 first:pt-0" data-testid="audit-entry">
          <div className="flex flex-col">
            <span className="text-body-sm font-medium text-foreground">{ACTIONS[e.action] ?? e.action}</span>
            <span className="text-caption text-muted">{e.actorEmail ?? "Unknown user"}{e.requestId && <> · request {e.requestId.slice(0, 8)}</>}</span>
          </div>
          <div className="flex flex-col items-end gap-0.5">
            <StatusBadge tone={e.outcome === "SUCCESS" ? "success" : "danger"} label={e.outcome.toLowerCase()} />
            <time className="text-caption text-muted" dateTime={String(e.createdAt)}>{when.format(new Date(e.createdAt))}</time>
          </div>
        </li>
      ))}
    </ul>
  );
}
