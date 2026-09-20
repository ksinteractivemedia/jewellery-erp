"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, ClipboardCheck, Plus } from "lucide-react";
import { PERMISSIONS, type AdjustmentView, type InventoryListItem } from "@jewellery/types";
import { Alert, Button, Card, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, EmptyState, FormField, InventoryStatusBadge, PageHeader, Skeleton, StatusBadge, Tabs, TabsList, TabsTrigger, Textarea, formatDate, formatWeight } from "@jewellery/ui";
import { inventoryApi } from "../../lib/api/inventory";
import { useAdjustments, useInventoryMutation } from "../../lib/api/inventory-queries";
import { useAuth } from "../../lib/auth/auth-context";
import { AdjustDialog } from "./adjust-dialog";
import { ItemPicker } from "./item-picker";

const TABS = [{ v: "PENDING", l: "Pending approval" }, { v: "APPROVED", l: "Approved" }, { v: "REJECTED", l: "Rejected" }, { v: "ALL", l: "All" }];
const TONE = { PENDING: "warning", APPROVED: "success", REJECTED: "neutral" } as const;

function changes(a: AdjustmentView): string[] {
  const out: string[] = [];
  if (a.toStatus) out.push(`Status → ${a.toStatus.toLowerCase().replace(/_/g, " ")}`);
  if (a.grossWeight !== undefined) out.push(`Gross weight → ${formatWeight(a.grossWeight)}${a.current ? ` (now ${formatWeight(a.current.grossWeight)})` : ""}`);
  if (a.stoneWeight !== undefined) out.push(`Stone weight → ${formatWeight(a.stoneWeight)}${a.current ? ` (now ${formatWeight(a.current.stoneWeight)})` : ""}`);
  if (a.quantityDelta !== undefined) out.push(`Quantity ${a.quantityDelta > 0 ? "+" : ""}${a.quantityDelta}`);
  if (a.weightDelta !== undefined) out.push(`Weight ${a.weightDelta > 0 ? "+" : ""}${formatWeight(a.weightDelta)}`);
  return out;
}

/** Four-eyes review of stock corrections: someone requests, someone else approves, and only then does the ledger change. */
export function AdjustmentsView() {
  const { can, user } = useAuth();
  const canRequest = can(PERMISSIONS.INVENTORY_ADJUST);
  const canDecide = can(PERMISSIONS.INVENTORY_APPROVE_ADJUSTMENT);
  const [tab, setTab] = React.useState("PENDING");
  const list = useAdjustments(tab === "ALL" ? {} : { status: tab });
  const [deciding, setDeciding] = React.useState<{ adj: AdjustmentView; kind: "approve" | "reject" } | null>(null);
  const [picking, setPicking] = React.useState(false);
  const [target, setTarget] = React.useState<InventoryListItem | null>(null);

  return (
    <>
      <PageHeader
        title="Adjustments"
        description="Corrections to stock records — found damaged, re-weighed, written off. A different person approves each one before it touches the ledger."
        breadcrumb={[{ label: "Home", href: "/" }, { label: "Inventory" }, { label: "Adjustments" }]}
        actions={canRequest && <Button onClick={() => setPicking(true)}><Plus className="h-4 w-4" /> Request adjustment</Button>}
      />
      <Tabs value={tab} onValueChange={setTab}><TabsList className="mb-4" aria-label="Adjustment status">{TABS.map((t) => <TabsTrigger key={t.v} value={t.v}>{t.l}</TabsTrigger>)}</TabsList></Tabs>

      {list.isError ? <Alert variant="danger" title="Couldn't load adjustments"><Button size="sm" variant="secondary" onClick={() => list.refetch()}>Retry</Button></Alert>
      : list.isLoading ? <div className="flex flex-col gap-2"><Skeleton className="h-28" /><Skeleton className="h-28" /></div>
      : (list.data?.adjustments.length ?? 0) === 0 ? <EmptyState icon={<ClipboardCheck className="h-8 w-8" />} title="Nothing here" description={tab === "PENDING" ? "No adjustments are waiting for approval." : "No adjustments match this tab."} />
      : (
        <ul className="flex flex-col gap-3" aria-label="Adjustments">
          {list.data!.adjustments.map((a) => {
            const mine = a.requestedBy === user?.id;
            return (
              <li key={a.id}>
                <Card className="flex flex-col gap-3 p-4" data-testid="adjustment-card">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex flex-col gap-0.5">
                      <span className="flex items-center gap-2"><span className="font-mono font-medium">{a.adjustmentNo}</span><StatusBadge tone={TONE[a.status]} label={a.status === "PENDING" ? "Pending" : a.status === "APPROVED" ? "Approved" : "Rejected"} /></span>
                      <Link href={`/inventory/stock/${a.itemId}`} className="font-mono text-body-sm text-primary-active hover:underline">{a.itemCode}</Link>
                    </div>
                    <span className="text-caption text-muted">Requested by {a.requestedByName ?? "—"} · {formatDate(a.createdAt)}</span>
                  </div>
                  <ul className="flex flex-col gap-0.5 text-body-sm">{changes(a).map((c) => <li key={c}>{c}</li>)}</ul>
                  <p className="text-body-sm text-muted">“{a.reason}”</p>
                  {a.current && a.status === "PENDING" && <p className="flex items-center gap-2 text-caption text-muted">Now: <InventoryStatusBadge status={a.current.status} /> · {formatWeight(a.current.grossWeight)}</p>}
                  {a.stale && <p role="alert" className="flex items-center gap-1.5 text-body-sm text-warning"><AlertTriangle className="h-4 w-4" aria-hidden="true" />This piece has moved since the request, so it can no longer be approved. Reject it and raise a new one.</p>}
                  {a.status !== "PENDING" && <p className="text-caption text-muted">{a.status === "APPROVED" ? "Approved" : "Rejected"} by {a.decidedByName ?? "—"}{a.decidedAt && ` · ${formatDate(a.decidedAt)}`}{a.decisionNote && ` · “${a.decisionNote}”`}</p>}
                  {a.status === "PENDING" && canDecide && (
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      {mine && <span className="mr-auto text-caption text-muted">You requested this — someone else must approve it.</span>}
                      <Button variant="secondary" size="sm" onClick={() => setDeciding({ adj: a, kind: "reject" })}>Reject</Button>
                      <Button size="sm" disabled={mine || a.stale} onClick={() => setDeciding({ adj: a, kind: "approve" })}>Approve</Button>
                    </div>
                  )}
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      <DecisionDialog decision={deciding} onClose={() => setDeciding(null)} />
      <Dialog open={picking} onOpenChange={setPicking}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>Which piece?</DialogTitle><DialogDescription>Search or scan the piece that needs correcting.</DialogDescription></DialogHeader>
          <ItemPicker single selected={target ? [target] : []} onChange={(s) => setTarget(s[0] ?? null)} />
          <DialogFooter><Button variant="secondary" onClick={() => setPicking(false)}>Cancel</Button><Button disabled={!target} onClick={() => setPicking(false)}>Continue</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <AdjustDialog item={!picking && target ? target : null} open={!picking && target !== null} onClose={() => setTarget(null)} />
    </>
  );
}

function DecisionDialog({ decision, onClose }: { decision: { adj: AdjustmentView; kind: "approve" | "reject" } | null; onClose: () => void }) {
  const [note, setNote] = React.useState("");
  const [error, setError] = React.useState<string>();
  React.useEffect(() => { setNote(""); setError(undefined); }, [decision?.adj.id, decision?.kind]);
  const run = useInventoryMutation(
    () => (decision!.kind === "approve" ? inventoryApi.approveAdjustment(decision!.adj.id, note || undefined) : inventoryApi.rejectAdjustment(decision!.adj.id, note || undefined)),
    { success: decision?.kind === "approve" ? "Approved — ledger updated" : "Rejected", onSuccess: onClose, onError: (e) => setError(e instanceof Error ? e.message : "Failed") }
  );
  const approve = decision?.kind === "approve";
  return (
    <Dialog open={decision !== null} onOpenChange={(o) => !o && !run.isPending && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{approve ? "Approve" : "Reject"} {decision?.adj.adjustmentNo}?</DialogTitle><DialogDescription>{approve ? "This writes the correction to the ledger. It can't be undone — a mistake is fixed by another adjustment." : "The piece is left as it is."}</DialogDescription></DialogHeader>
        <FormField label="Note" htmlFor="decision-note"><Textarea id="decision-note" rows={2} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} /></FormField>
        {error && <Alert variant="danger">{error}</Alert>}
        <DialogFooter><Button variant="secondary" onClick={onClose} disabled={run.isPending}>Cancel</Button><Button variant={approve ? "primary" : "destructive"} loading={run.isPending} onClick={() => run.mutate(undefined)}>{approve ? "Approve" : "Reject"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
