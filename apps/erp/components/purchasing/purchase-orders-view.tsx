"use client";

import * as React from "react";
import { ClipboardList } from "lucide-react";
import { EmptyState } from "@jewellery/ui";
import type { PurchaseLine, PurchaseOrder } from "@jewellery/types";
import { PERMISSIONS as P } from "@jewellery/types";
import { useAuth } from "../../lib/auth/auth-context";
import { useInventoryMeta } from "../../lib/api/inventory-queries";
import { purchasingApi, usePurchaseOrders, usePurchasingAction, useSuppliers } from "../../lib/api/purchasing";
import { errorMessage } from "../../lib/api/queries";
import { Field, Load, PURCHASE_TYPE_LABEL, Status, Table, Td, Th, WEIGHT_TRACKED, btn, day, grams, inputCls, money, rupeesToPaise } from "./shared";
import { GoodsReceiptsForOrder, ReceiveGoodsForm } from "./goods-receipt-panel";
import { RequisitionsPanel } from "./requisitions-panel";

const GROUPS: [string, string][] = [["", "All"], ["DRAFT,SUBMITTED", "To approve"], ["APPROVED,PARTIALLY_RECEIVED", "Awaiting receipt"], ["RECEIVED", "Received"], ["CANCELLED", "Cancelled"]];
const PURCHASE_TYPES = ["GOLD", "SILVER", "PLATINUM", "STONE", "FINISHED_JEWELLERY", "RAW_MATERIAL", "CONSUMABLE"] as const;

interface LineDraft {
  purchaseType: string;
  description: string;
  metalId: string;
  purity: string;
  quantity: string;
  grossWeight: string;
  ratePerGram: string;
  ratePerUnit: string;
  lotNumber: string;
}
const emptyLine = (): LineDraft => ({ purchaseType: "GOLD", description: "", metalId: "", purity: "", quantity: "1", grossWeight: "", ratePerGram: "", ratePerUnit: "", lotNumber: "" });

function lineToBody(l: LineDraft): object | undefined {
  const weightTracked = WEIGHT_TRACKED.has(l.purchaseType);
  const consumable = l.purchaseType === "CONSUMABLE";
  if (!l.description.trim()) return undefined;
  const base = { purchaseType: l.purchaseType, description: l.description.trim(), quantity: Number(l.quantity) || 1, ...(l.lotNumber.trim() ? { lotNumber: l.lotNumber.trim() } : {}) };
  if (!consumable) {
    if (!l.metalId || !l.purity) return undefined;
    Object.assign(base, { metalId: l.metalId, purity: l.purity });
  }
  if (weightTracked) {
    const grossWeight = Number(l.grossWeight);
    const ratePerGram = rupeesToPaise(l.ratePerGram);
    if (!grossWeight || !ratePerGram) return undefined;
    Object.assign(base, { grossWeight, ratePerGram });
  } else if (l.ratePerUnit.trim() || !consumable) {
    const ratePerUnit = rupeesToPaise(l.ratePerUnit);
    if (!consumable && !ratePerUnit) return undefined;
    if (ratePerUnit) Object.assign(base, { ratePerUnit });
  }
  return base;
}

/** One purchase-order line: the fields that matter depend on the purchase type (metal + weight vs. metal + piece rate vs. neither). */
function LineEditor({ l, onChange, onRemove, meta }: { l: LineDraft; onChange: (l: LineDraft) => void; onRemove: () => void; meta: ReturnType<typeof useInventoryMeta>["data"] }) {
  const weightTracked = WEIGHT_TRACKED.has(l.purchaseType);
  const consumable = l.purchaseType === "CONSUMABLE";
  const purities = meta?.metals.find((m) => m.id === l.metalId)?.purities ?? [];
  return (
    <div className="grid grid-cols-2 gap-2 rounded-md border border-border-subtle p-3 sm:grid-cols-4 lg:grid-cols-8" data-testid="po-line">
      <Field label="Type"><select className={inputCls} value={l.purchaseType} onChange={(e) => onChange({ ...l, purchaseType: e.target.value })} data-testid="line-type">{PURCHASE_TYPES.map((t) => <option key={t} value={t}>{PURCHASE_TYPE_LABEL[t]}</option>)}</select></Field>
      <Field label="Description"><input className={inputCls} value={l.description} onChange={(e) => onChange({ ...l, description: e.target.value })} data-testid="line-description" /></Field>
      {!consumable && (
        <>
          <Field label="Metal"><select className={inputCls} value={l.metalId} onChange={(e) => onChange({ ...l, metalId: e.target.value, purity: "" })} data-testid="line-metal"><option value="">Choose…</option>{(meta?.metals ?? []).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></Field>
          <Field label="Purity"><select className={inputCls} value={l.purity} onChange={(e) => onChange({ ...l, purity: e.target.value })} data-testid="line-purity"><option value="">Choose…</option>{purities.map((p) => <option key={p} value={p}>{p}</option>)}</select></Field>
        </>
      )}
      <Field label="Qty"><input className={inputCls} inputMode="numeric" value={l.quantity} onChange={(e) => onChange({ ...l, quantity: e.target.value })} data-testid="line-quantity" /></Field>
      {weightTracked ? (
        <>
          <Field label="Gross wt (g)"><input className={inputCls} inputMode="decimal" value={l.grossWeight} onChange={(e) => onChange({ ...l, grossWeight: e.target.value })} data-testid="line-gross-weight" /></Field>
          <Field label="Rate / g (₹)"><input className={inputCls} inputMode="decimal" value={l.ratePerGram} onChange={(e) => onChange({ ...l, ratePerGram: e.target.value })} data-testid="line-rate-per-gram" /></Field>
        </>
      ) : (
        <Field label={consumable ? "Rate / unit (₹, optional)" : "Rate / unit (₹)"}><input className={inputCls} inputMode="decimal" value={l.ratePerUnit} onChange={(e) => onChange({ ...l, ratePerUnit: e.target.value })} data-testid="line-rate-per-unit" /></Field>
      )}
      <Field label="Lot #"><input className={inputCls} value={l.lotNumber} onChange={(e) => onChange({ ...l, lotNumber: e.target.value })} /></Field>
      <div className="flex items-end"><button type="button" className={btn("danger")} onClick={onRemove} data-testid="line-remove">Remove</button></div>
    </div>
  );
}

function NewPurchaseOrderForm({ onDone }: { onDone: () => void }) {
  const suppliers = useSuppliers();
  const meta = useInventoryMeta();
  const [supplierId, setSupplierId] = React.useState("");
  const [deliveryLocationId, setDeliveryLocationId] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [lines, setLines] = React.useState<LineDraft[]>([emptyLine()]);
  const [err, setErr] = React.useState<string>();
  const bodies = lines.map(lineToBody).filter((b): b is object => !!b);
  const create = usePurchasingAction(purchasingApi.createPurchaseOrder, "Purchase order created", onDone);
  const go = (submit: boolean) => create.mutate({ supplierId, deliveryLocationId, lines: bodies, submit, ...(notes.trim() ? { notes: notes.trim() } : {}) } as never, { onError: (e) => setErr(errorMessage(e)) });
  const canSubmit = supplierId && deliveryLocationId && bodies.length === lines.length && bodies.length > 0;
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4" data-testid="new-po-form">
      <h3 className="text-h4 font-semibold">New purchase order</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Supplier"><select className={inputCls} value={supplierId} onChange={(e) => setSupplierId(e.target.value)} data-testid="po-supplier"><option value="">Choose…</option>{(suppliers.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
        <Field label="Deliver to"><select className={inputCls} value={deliveryLocationId} onChange={(e) => setDeliveryLocationId(e.target.value)} data-testid="po-location"><option value="">Choose…</option>{(meta.data?.locations ?? []).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></Field>
      </div>
      <div className="flex flex-col gap-2">{lines.map((l, i) => <LineEditor key={i} l={l} meta={meta.data} onChange={(v) => setLines((ls) => ls.map((x, j) => (j === i ? v : x)))} onRemove={() => setLines((ls) => ls.filter((_, j) => j !== i))} />)}</div>
      <button type="button" className={btn()} onClick={() => setLines((ls) => [...ls, emptyLine()])} data-testid="add-line">+ Add line</button>
      <Field label="Notes"><textarea className={`${inputCls} h-auto py-2`} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      {err && <p className="text-body-sm text-danger" role="alert" data-testid="po-form-error">{err}</p>}
      <div className="flex gap-2">
        <button className={btn()} disabled={!canSubmit || create.isPending} onClick={() => go(false)} data-testid="po-save-draft">Save draft</button>
        <button className={btn("primary")} disabled={!canSubmit || create.isPending} onClick={() => go(true)} data-testid="po-submit-new">Submit for approval</button>
      </div>
    </div>
  );
}

function LinesTable({ lines }: { lines: PurchaseLine[] }) {
  return (
    <Table testId="po-lines"><thead><tr><Th>Type</Th><Th>Description</Th><Th right>Qty</Th><Th right>Gross wt</Th><Th right>Rate</Th><Th right>Value</Th><Th right>Received</Th></tr></thead><tbody>
      {lines.map((l, i) => (
        <tr key={i} data-testid="po-line-row">
          <Td>{PURCHASE_TYPE_LABEL[l.purchaseType]}{l.purity && <span className="ml-1 text-muted">({l.purity})</span>}</Td>
          <Td>{l.description}{l.lotNumber && <span className="block text-caption text-muted">Lot {l.lotNumber}</span>}</Td>
          <Td right>{l.quantity}</Td>
          <Td right>{grams(l.grossWeight)}</Td>
          <Td right>{l.ratePerGram ? `${money(l.ratePerGram)}/g` : l.ratePerUnit ? `${money(l.ratePerUnit)}/pc` : "—"}</Td>
          <Td right className="font-medium">{money(l.value)}</Td>
          <Td right>{WEIGHT_TRACKED.has(l.purchaseType) ? `${grams(l.receivedGrossWeight)} / ${grams(l.grossWeight)}` : `${l.receivedQuantity} / ${l.quantity}`}</Td>
        </tr>
      ))}
    </tbody></Table>
  );
}

function Detail({ po, onDone }: { po: PurchaseOrder; onDone: () => void }) {
  const { can } = useAuth();
  const [mode, setMode] = React.useState<"none" | "cancel" | "receive">("none");
  const [reason, setReason] = React.useState("");
  const [err, setErr] = React.useState<string>();
  const done = () => { setMode("none"); setErr(undefined); onDone(); };
  const fail = (e: unknown) => setErr(errorMessage(e));
  const run = (m: { mutate: (v: undefined, o?: { onError?: (e: unknown) => void }) => void }) => m.mutate(undefined, { onError: fail });
  const submit = usePurchasingAction(() => purchasingApi.submitPurchaseOrder(po.id), "Submitted for approval", done as () => void);
  const approve = usePurchasingAction(() => purchasingApi.approvePurchaseOrder(po.id), "Approved", done as () => void);
  const cancel = usePurchasingAction(() => purchasingApi.cancelPurchaseOrder(po.id, reason.trim() || undefined), "Cancelled", done as () => void);
  const approver = can(P.PURCHASING_APPROVE);
  const canCancel = can(P.PURCHASING_CANCEL) && !["RECEIVED", "CANCELLED"].includes(po.status);
  const canReceive = can(P.PURCHASING_RECEIVE) && ["APPROVED", "PARTIALLY_RECEIVED"].includes(po.status);
  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4" data-testid="po-detail">
      <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-h4 font-semibold">{po.poNo} <span className="font-normal text-muted">· {po.supplier.name}</span></h3><Status s={po.status} /></div>
      <LinesTable lines={po.lines} />
      <p className="text-body-sm text-muted">Total {money(po.totals.total)} · ships to {po.deliveryLocation.name}{po.expectedDeliveryDate && ` · expected ${day(po.expectedDeliveryDate)}`}</p>
      {po.notes && <p className="text-body-sm">Notes: {po.notes}</p>}
      {err && <p className="text-body-sm text-danger" role="alert" data-testid="po-error">{err}</p>}
      <div className="flex flex-wrap gap-2">
        {po.status === "DRAFT" && <button className={btn("primary")} onClick={() => run(submit)} data-testid="po-submit">Submit for approval</button>}
        {approver && po.status === "SUBMITTED" && <button className={btn("primary")} onClick={() => run(approve)} data-testid="po-approve">Approve</button>}
        {canReceive && <button className={btn("primary")} onClick={() => setMode("receive")} data-testid="po-receive">Receive goods…</button>}
        {canCancel && <button className={btn("danger")} onClick={() => setMode("cancel")} data-testid="po-cancel">Cancel…</button>}
      </div>
      {mode === "cancel" && (
        <div className="flex flex-col gap-2 rounded-md border border-border-subtle p-3">
          <Field label="Reason"><input className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} data-testid="po-cancel-reason" /></Field>
          <div className="flex gap-2"><button className={btn("danger")} disabled={cancel.isPending} onClick={() => run(cancel)} data-testid="po-cancel-go">Cancel order</button><button className={btn()} onClick={() => setMode("none")}>Close</button></div>
        </div>
      )}
      {mode === "receive" && <ReceiveGoodsForm po={po} onDone={done} onCancel={() => setMode("none")} />}
      <GoodsReceiptsForOrder poId={po.id} />
    </div>
  );
}

export function PurchaseOrdersView() {
  const [g, setG] = React.useState("");
  const [creating, setCreating] = React.useState(false);
  const q = usePurchaseOrders(g || undefined);
  const [sel, setSel] = React.useState<string>();
  const items = q.data ?? [];
  const current = items.find((p) => p.id === sel);
  const { can } = useAuth();
  return (
    <div className="flex flex-col gap-4">
      <RequisitionsPanel />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Filter">{GROUPS.map(([v, l]) => <button key={l} role="tab" aria-selected={g === v} className={`h-8 rounded-full border px-3 text-caption ${g === v ? "border-foreground bg-foreground text-background" : "border-border bg-surface"}`} onClick={() => setG(v)}>{l}</button>)}</div>
        {can(P.PURCHASING_CREATE) && <button className={btn("primary")} onClick={() => setCreating((v) => !v)} data-testid="po-new">{creating ? "Close" : "New purchase order"}</button>}
      </div>
      {creating && <NewPurchaseOrderForm onDone={() => { setCreating(false); q.refetch(); }} />}
      <Load q={q}>
        {items.length === 0 ? <EmptyState icon={<ClipboardList className="h-8 w-8" />} title="No purchase orders match" description="Try a different filter, or create a new purchase order." /> : (
          <Table testId="po-table"><thead><tr><Th>PO</Th><Th>Supplier</Th><Th right>Total</Th><Th>Status</Th></tr></thead><tbody>
            {items.map((p) => <tr key={p.id} className={`cursor-pointer hover:bg-surface-sunken ${sel === p.id ? "bg-surface-sunken" : ""}`} onClick={() => setSel(p.id)} data-testid="po-row"><Td className="font-medium">{p.poNo}</Td><Td>{p.supplier.name}</Td><Td right>{money(p.totals.total)}</Td><Td><Status s={p.status} /></Td></tr>)}
          </tbody></Table>
        )}
      </Load>
      {current && <Detail key={current.id + current.status} po={current} onDone={() => q.refetch()} />}
    </div>
  );
}
