"use client";

import * as React from "react";
import { ArrowRight, Plus, Truck } from "lucide-react";
import { PERMISSIONS, type InventoryListItem, type TransferView } from "@jewellery/types";
import { Alert, Button, Card, Checkbox, Combobox, DetailPanel, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, EmptyState, FormField, PageHeader, Skeleton, StatusBadge, Tabs, TabsList, TabsTrigger, Textarea, formatDate } from "@jewellery/ui";
import { inventoryApi } from "../../lib/api/inventory";
import { useInventoryMeta, useInventoryMutation, useTransfers } from "../../lib/api/inventory-queries";
import { useAuth } from "../../lib/auth/auth-context";
import { STOCK_LOCATION_TYPES } from "../../lib/inventory/format";
import { ItemPicker } from "./item-picker";

const TABS = [{ v: "IN_TRANSIT", l: "In transit" }, { v: "RECEIVED", l: "Received" }, { v: "CANCELLED", l: "Cancelled" }, { v: "ALL", l: "All" }];
const TONE = { IN_TRANSIT: "info", RECEIVED: "success", CANCELLED: "neutral" } as const;
const LINE_TONE = { PENDING: "warning", RECEIVED: "success", RETURNED: "neutral" } as const;

export function TransfersView() {
  const { can } = useAuth();
  const canMove = can(PERMISSIONS.INVENTORY_TRANSFER);
  const [tab, setTab] = React.useState("IN_TRANSIT");
  const transfers = useTransfers(tab === "ALL" ? {} : { status: tab });
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState(false);
  const open = transfers.data?.transfers.find((t) => t.id === openId) ?? null;

  return (
    <>
      <PageHeader
        title="Transfers"
        description="Moving pieces between stores, warehouses, counters and vaults. They&apos;re in transit — neither here nor there — until the other end receives them."
        breadcrumb={[{ label: "Home", href: "/" }, { label: "Inventory" }, { label: "Transfers" }]}
        actions={canMove && <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> New transfer</Button>}
      />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-4" aria-label="Transfer status">{TABS.map((t) => <TabsTrigger key={t.v} value={t.v}>{t.l}</TabsTrigger>)}</TabsList>
      </Tabs>

      {transfers.isError ? (
        <Alert variant="danger" title="Couldn't load transfers"><Button size="sm" variant="secondary" onClick={() => transfers.refetch()}>Retry</Button></Alert>
      ) : transfers.isLoading ? (
        <div className="flex flex-col gap-2"><Skeleton className="h-20" /><Skeleton className="h-20" /></div>
      ) : (transfers.data?.transfers.length ?? 0) === 0 ? (
        <EmptyState icon={<Truck className="h-8 w-8" />} title="No transfers here" description={tab === "IN_TRANSIT" ? "Nothing is on its way right now." : "No transfers match this tab."} action={canMove ? <Button onClick={() => setCreating(true)}>New transfer</Button> : undefined} />
      ) : (
        <ul className="flex flex-col gap-2" aria-label="Transfers">
          {transfers.data!.transfers.map((t) => {
            const pending = t.lines.filter((l) => l.state === "PENDING").length;
            return (
              <li key={t.id}>
                <button type="button" onClick={() => setOpenId(t.id)} className="w-full text-left" data-testid="transfer-row">
                  <Card className="flex flex-wrap items-center justify-between gap-3 p-4 transition-colors hover:bg-surface-sunken">
                    <div className="flex min-w-0 flex-col gap-1">
                      <span className="flex items-center gap-2"><span className="font-mono font-medium">{t.transferNo}</span><StatusBadge tone={TONE[t.status]} label={t.status === "IN_TRANSIT" ? "In transit" : t.status === "RECEIVED" ? "Received" : "Cancelled"} /></span>
                      <span className="flex items-center gap-1.5 text-body-sm text-muted">{t.fromLocation.name}<ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />{t.toLocation.name}</span>
                    </div>
                    <div className="flex flex-col items-end gap-0.5 text-body-sm">
                      <span>{t.lines.length} piece{t.lines.length === 1 ? "" : "s"}{t.status === "IN_TRANSIT" && pending !== t.lines.length ? ` · ${pending} pending` : ""}</span>
                      <span className="text-caption text-muted">{t.dispatchedByName ?? "—"} · {formatDate(t.dispatchedAt)}</span>
                    </div>
                  </Card>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <TransferPanel transfer={open} canMove={canMove} onClose={() => setOpenId(null)} />
      <NewTransferDialog open={creating} onClose={() => setCreating(false)} />
    </>
  );
}

function TransferPanel({ transfer, canMove, onClose }: { transfer: TransferView | null; canMove: boolean; onClose: () => void }) {
  const [picked, setPicked] = React.useState<Set<string>>(new Set());
  const [cancelling, setCancelling] = React.useState(false);
  const [reason, setReason] = React.useState("");
  React.useEffect(() => { setPicked(new Set()); setCancelling(false); setReason(""); }, [transfer?.id]);

  const receive = useInventoryMutation((ids?: string[]) => inventoryApi.receiveTransfer(transfer!.id, ids), { success: "Received", onSuccess: () => setPicked(new Set()) });
  const cancel = useInventoryMutation(() => inventoryApi.cancelTransfer(transfer!.id, reason || undefined), { success: "Transfer cancelled — pieces returned to source", onSuccess: () => { setCancelling(false); onClose(); } });
  const pending = transfer?.lines.filter((l) => l.state === "PENDING") ?? [];

  return (
    <>
      <DetailPanel
        open={transfer !== null}
        onOpenChange={(o) => !o && onClose()}
        title={transfer?.transferNo ?? ""}
        description={transfer ? `${transfer.fromLocation.name} → ${transfer.toLocation.name}` : undefined}
        footer={
          transfer && canMove && transfer.status === "IN_TRANSIT" ? (
            <div className="flex w-full flex-wrap justify-between gap-2">
              <Button variant="secondary" onClick={() => setCancelling(true)}>Cancel transfer</Button>
              <div className="flex gap-2">
                {picked.size > 0 && <Button variant="secondary" loading={receive.isPending} onClick={() => receive.mutate([...picked])}>Receive selected ({picked.size})</Button>}
                <Button loading={receive.isPending} onClick={() => receive.mutate(undefined)}>Receive all pending ({pending.length})</Button>
              </div>
            </div>
          ) : undefined
        }
      >
        {transfer && (
          <div className="flex flex-col gap-4">
            {transfer.notes && <p className="text-body-sm text-muted">“{transfer.notes}”</p>}
            <ul className="flex flex-col divide-y divide-border-subtle" aria-label="Pieces on this transfer">
              {transfer.lines.map((l) => (
                <li key={l.itemId} className="flex items-center justify-between gap-3 py-2">
                  <span className="flex items-center gap-3">
                    {transfer.status === "IN_TRANSIT" && canMove && l.state === "PENDING" && <Checkbox checked={picked.has(l.itemId)} onCheckedChange={() => setPicked((s) => { const n = new Set(s); n.has(l.itemId) ? n.delete(l.itemId) : n.add(l.itemId); return n; })} aria-label={`Select ${l.itemCode}`} />}
                    <a href={`/inventory/stock/${l.itemId}`} className="font-mono text-body-sm hover:text-primary-active hover:underline">{l.itemCode}</a>
                  </span>
                  <StatusBadge tone={LINE_TONE[l.state]} label={l.state === "PENDING" ? "Pending" : l.state === "RECEIVED" ? "Received" : "Returned to source"} />
                </li>
              ))}
            </ul>
          </div>
        )}
      </DetailPanel>
      <Dialog open={cancelling} onOpenChange={(o) => !cancel.isPending && setCancelling(o)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Cancel {transfer?.transferNo}?</DialogTitle><DialogDescription>{pending.length} pending piece{pending.length === 1 ? "" : "s"} go back to {transfer?.fromLocation.name}. Anything already received stays where it arrived.</DialogDescription></DialogHeader>
          <FormField label="Reason" htmlFor="cancel-reason"><Textarea id="cancel-reason" rows={2} value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} /></FormField>
          <DialogFooter><Button variant="secondary" onClick={() => setCancelling(false)} disabled={cancel.isPending}>Keep transfer</Button><Button variant="destructive" loading={cancel.isPending} onClick={() => cancel.mutate(undefined)}>Cancel transfer</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function NewTransferDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const meta = useInventoryMeta();
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const [items, setItems] = React.useState<InventoryListItem[]>([]);
  const [notes, setNotes] = React.useState("");
  const [error, setError] = React.useState<string>();
  React.useEffect(() => { if (open) { setFrom(""); setTo(""); setItems([]); setNotes(""); setError(undefined); } }, [open]);
  React.useEffect(() => setItems([]), [from]);

  const locations = (meta.data?.locations ?? []).filter((l) => STOCK_LOCATION_TYPES.includes(l.type)).map((l) => ({ value: l.id, label: l.name }));
  const create = useInventoryMutation(() => inventoryApi.createTransfer({ fromLocationId: from, toLocationId: to, itemIds: items.map((i) => i.id), notes: notes || undefined }), {
    success: (t) => `Dispatched ${t.transferNo}`, onSuccess: onClose, onError: (e) => setError(e instanceof Error ? e.message : "Failed"),
  });
  return (
    <Dialog open={open} onOpenChange={(o) => !o && !create.isPending && onClose()}>
      <DialogContent className="max-w-xl">
        <form onSubmit={(e) => { e.preventDefault(); setError(undefined); create.mutate(undefined); }} className="flex flex-col gap-4">
          <DialogHeader><DialogTitle>New transfer</DialogTitle><DialogDescription>Pick where the pieces are now, where they&apos;re going, and which pieces. Only available pieces at the source can be sent.</DialogDescription></DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label="From" htmlFor="tr-from" required><Combobox aria-label="From location" placeholder="Choose source" searchPlaceholder="Search locations…" options={locations} value={from} onValueChange={setFrom} /></FormField>
            <FormField label="To" htmlFor="tr-to" required><Combobox aria-label="To location" placeholder="Choose destination" searchPlaceholder="Search locations…" options={locations.filter((l) => l.value !== from)} value={to} onValueChange={setTo} /></FormField>
          </div>
          {from ? <ItemPicker selected={items} onChange={setItems} locationId={from} status="AVAILABLE" /> : <p className="text-body-sm text-muted">Choose a source to see its pieces.</p>}
          <FormField label="Note" htmlFor="tr-notes"><Textarea id="tr-notes" rows={2} value={notes} maxLength={500} onChange={(e) => setNotes(e.target.value)} /></FormField>
          {error && <Alert variant="danger">{error}</Alert>}
          <DialogFooter><Button type="button" variant="secondary" onClick={onClose} disabled={create.isPending}>Cancel</Button><Button type="submit" disabled={!from || !to || items.length === 0} loading={create.isPending}>Dispatch {items.length || ""} piece{items.length === 1 ? "" : "s"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
