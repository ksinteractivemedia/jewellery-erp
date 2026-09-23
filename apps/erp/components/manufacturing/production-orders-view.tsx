"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import type { ProductionOrder } from "@jewellery/types";
import { PERMISSIONS as P } from "@jewellery/types";
import { useAuth } from "../../lib/auth/auth-context";
import { catalogApi } from "../../lib/api/catalog";
import { useInventoryMeta } from "../../lib/api/inventory-queries";
import { manufacturingApi, useManufacturingAction, useProductionOrders } from "../../lib/api/manufacturing";
import { errorMessage } from "../../lib/api/queries";
import { Field, Load, ReconciliationStrip, Status, Table, Td, Th, btn, grams, inputCls, money, rupeesToPaise } from "./shared";
import { ItemPicker } from "./item-picker";

const GROUPS: [string, string][] = [["", "All"], ["DRAFT", "Draft"], ["MATERIAL_ISSUED,IN_PROGRESS", "In progress"], ["QC_PENDING,QC_FAILED", "QC"], ["COMPLETED", "Completed"], ["CANCELLED", "Cancelled"]];

function NewProductionOrderForm({ onDone }: { onDone: () => void }) {
  const products = useQuery({ queryKey: ["catalog", "products", "picker"], queryFn: () => catalogApi.listProducts({ pageSize: 100, sort: "name", order: "asc" } as never), staleTime: 60_000 });
  const meta = useInventoryMeta();
  const [productId, setProductId] = React.useState("");
  const [quantity, setQuantity] = React.useState("1");
  const [metalId, setMetalId] = React.useState("");
  const [purity, setPurity] = React.useState("");
  const [expectedGrossWeight, setExpectedGrossWeight] = React.useState("");
  const [expectedWastage, setExpectedWastage] = React.useState("");
  const [locationId, setLocationId] = React.useState("");
  const [err, setErr] = React.useState<string>();
  const purities = meta.data?.metals.find((m) => m.id === metalId)?.purities ?? [];
  const workshops = (meta.data?.locations ?? []).filter((l) => l.type === "MANUFACTURING_UNIT");
  const create = useManufacturingAction(manufacturingApi.createProductionOrder, "Production order created", onDone);
  const canSubmit = productId && metalId && purity && Number(expectedGrossWeight) > 0 && locationId;
  return (
    <div className="grid gap-3 rounded-lg border border-border bg-surface p-4 sm:grid-cols-3" data-testid="new-mo-form">
      <h3 className="text-h4 font-semibold sm:col-span-3">New production order</h3>
      <Field label="Design"><select className={inputCls} value={productId} onChange={(e) => setProductId(e.target.value)} data-testid="mo-product"><option value="">Choose…</option>{(products.data?.items ?? []).map((p: { id: string; name: string; sku: string }) => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}</select></Field>
      <Field label="Quantity"><input className={inputCls} inputMode="numeric" value={quantity} onChange={(e) => setQuantity(e.target.value)} data-testid="mo-quantity" /></Field>
      <Field label="Manufacturing unit"><select className={inputCls} value={locationId} onChange={(e) => setLocationId(e.target.value)} data-testid="mo-location"><option value="">Choose…</option>{workshops.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></Field>
      <Field label="Metal"><select className={inputCls} value={metalId} onChange={(e) => { setMetalId(e.target.value); setPurity(""); }} data-testid="mo-metal"><option value="">Choose…</option>{(meta.data?.metals ?? []).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></Field>
      <Field label="Purity"><select className={inputCls} value={purity} onChange={(e) => setPurity(e.target.value)} data-testid="mo-purity"><option value="">Choose…</option>{purities.map((p) => <option key={p} value={p}>{p}</option>)}</select></Field>
      <Field label="Expected gross weight (g)"><input className={inputCls} inputMode="decimal" value={expectedGrossWeight} onChange={(e) => setExpectedGrossWeight(e.target.value)} data-testid="mo-expected-weight" /></Field>
      <Field label="Expected wastage (g)"><input className={inputCls} inputMode="decimal" value={expectedWastage} onChange={(e) => setExpectedWastage(e.target.value)} data-testid="mo-expected-wastage" /></Field>
      {err && <p className="text-body-sm text-danger sm:col-span-3" role="alert">{err}</p>}
      <div className="sm:col-span-3">
        <button
          className={btn("primary")}
          disabled={!canSubmit || create.isPending}
          onClick={() => create.mutate({ productId, quantity: Number(quantity) || 1, locationId, bom: { metalId, purity, expectedGrossWeight: Number(expectedGrossWeight), expectedWastage: Number(expectedWastage) || 0, stonesRequired: [] } } as never, { onError: (e) => setErr(errorMessage(e)) })}
          data-testid="mo-save"
        >
          Create production order
        </button>
      </div>
    </div>
  );
}

function IssueMaterial({ order, onDone }: { order: ProductionOrder; onDone: () => void }) {
  const [selected, setSelected] = React.useState<string[]>([]);
  const [err, setErr] = React.useState<string>();
  const issue = useManufacturingAction(() => manufacturingApi.issueMaterial(order.id, selected), "Material issued", onDone);
  return (
    <div className="flex flex-col gap-3 rounded-md border border-primary p-3" data-testid="issue-material-form">
      <p className="text-body-sm text-muted">Needs ~{grams(order.bom.expectedGrossWeight)} of {order.bom.purity}. Pick whole pieces close to that — a batch is never split.</p>
      <ItemPicker metalId={order.bom.metalId} purity={order.bom.purity} selected={selected} onChange={setSelected} />
      {err && <p className="text-body-sm text-danger" role="alert">{err}</p>}
      <div><button className={btn("primary")} disabled={!selected.length || issue.isPending} onClick={() => issue.mutate(undefined, { onError: (e) => setErr(errorMessage(e)) })} data-testid="issue-go">Issue {selected.length} item{selected.length === 1 ? "" : "s"}</button></div>
    </div>
  );
}

function SubmitQc({ order, onDone }: { order: ProductionOrder; onDone: () => void }) {
  const [actualGrossWeight, setActualGrossWeight] = React.useState(String(order.issuedGrossWeight));
  const [actualWastage, setActualWastage] = React.useState(String(order.bom.expectedWastage));
  const [labourCost, setLabourCost] = React.useState("");
  const [err, setErr] = React.useState<string>();
  const submit = useManufacturingAction(() => manufacturingApi.submitForQc(order.id, { actualGrossWeight: Number(actualGrossWeight), actualWastage: Number(actualWastage) || 0, labourCost: rupeesToPaise(labourCost) ?? 0 }), "Submitted for QC", onDone);
  return (
    <div className="grid gap-3 rounded-md border border-primary p-3 sm:grid-cols-3" data-testid="submit-qc-form">
      <Field label="Actual gross weight (g)"><input className={inputCls} inputMode="decimal" value={actualGrossWeight} onChange={(e) => setActualGrossWeight(e.target.value)} data-testid="qc-actual-weight" /></Field>
      <Field label="Actual wastage (g)"><input className={inputCls} inputMode="decimal" value={actualWastage} onChange={(e) => setActualWastage(e.target.value)} data-testid="qc-actual-wastage" /></Field>
      <Field label="Labour / making cost (₹)"><input className={inputCls} inputMode="decimal" value={labourCost} onChange={(e) => setLabourCost(e.target.value)} data-testid="qc-labour-cost" /></Field>
      {err && <p className="text-body-sm text-danger sm:col-span-3" role="alert">{err}</p>}
      <div className="sm:col-span-3"><button className={btn("primary")} disabled={!Number(actualGrossWeight) || submit.isPending} onClick={() => submit.mutate(undefined, { onError: (e) => setErr(errorMessage(e)) })} data-testid="submit-qc-go">Submit for QC</button></div>
    </div>
  );
}

function CompleteForm({ order, onDone }: { order: ProductionOrder; onDone: () => void }) {
  const [grossWeight, setGrossWeight] = React.useState(String(order.actualGrossWeight ?? ""));
  const [pieces, setPieces] = React.useState("1");
  const [returnedItemIds, setReturnedItemIds] = React.useState<string[]>([]);
  const [wastage, setWastage] = React.useState(String(order.actualWastage ?? order.bom.expectedWastage));
  const [note, setNote] = React.useState("");
  const [err, setErr] = React.useState<string>();
  const complete = useManufacturingAction(() => manufacturingApi.completeProduction(order.id, { finishedPieces: [{ quantity: Number(pieces) || 1, grossWeight: Number(grossWeight) }], returnedItemIds, wastage: Number(wastage) || 0, ...(note.trim() ? { discrepancyNote: note.trim() } : {}) }), "Production completed", onDone);
  const unreturned = order.issuedItems;
  const toggle = (id: string) => setReturnedItemIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  return (
    <div className="flex flex-col gap-3 rounded-md border border-primary p-3" data-testid="complete-form">
      <p className="font-semibold">Finished piece(s)</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Pieces"><input className={inputCls} inputMode="numeric" value={pieces} onChange={(e) => setPieces(e.target.value)} data-testid="complete-pieces" /></Field>
        <Field label="Gross weight each (g)"><input className={inputCls} inputMode="decimal" value={grossWeight} onChange={(e) => setGrossWeight(e.target.value)} data-testid="complete-gross-weight" /></Field>
        <Field label="Wastage (g)"><input className={inputCls} inputMode="decimal" value={wastage} onChange={(e) => setWastage(e.target.value)} data-testid="complete-wastage" /></Field>
      </div>
      {unreturned.length > 0 && (
        <div>
          <p className="mb-1 text-body-sm font-medium">Return unused material</p>
          <ul className="flex flex-col gap-1">{unreturned.map((i) => <li key={i.itemId} className="flex items-center gap-2 text-body-sm"><input type="checkbox" checked={returnedItemIds.includes(i.itemId)} onChange={() => toggle(i.itemId)} id={`ret-${i.itemId}`} /><label htmlFor={`ret-${i.itemId}`}>{i.itemCode} — {grams(i.grossWeight)}</label></li>)}</ul>
        </div>
      )}
      <Field label="Discrepancy note (required if the numbers don't balance)"><input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} data-testid="complete-note" /></Field>
      {err && <p className="text-body-sm text-danger" role="alert" data-testid="complete-error">{err}</p>}
      <div><button className={btn("primary")} disabled={!Number(grossWeight) || complete.isPending} onClick={() => complete.mutate(undefined, { onError: (e) => setErr(errorMessage(e)) })} data-testid="complete-go">Complete & create inventory</button></div>
    </div>
  );
}

function Detail({ order, onDone }: { order: ProductionOrder; onDone: () => void }) {
  const { can } = useAuth();
  const [mode, setMode] = React.useState<"" | "issue" | "qc" | "complete" | "cancel">("");
  const [reason, setReason] = React.useState("");
  const [failNotes, setFailNotes] = React.useState("");
  const [err, setErr] = React.useState<string>();
  const done = () => { setMode(""); setErr(undefined); onDone(); };
  const fail = (e: unknown) => setErr(errorMessage(e));
  const run = (m: { mutate: (v: undefined, o?: { onError?: (e: unknown) => void }) => void }) => m.mutate(undefined, { onError: fail });
  const start = useManufacturingAction(() => manufacturingApi.startManufacturing(order.id), "Manufacturing started", done as () => void);
  const passQc = useManufacturingAction(() => manufacturingApi.passQc(order.id), "QC passed", done as () => void);
  const failQc = useManufacturingAction(() => manufacturingApi.failQc(order.id, failNotes.trim()), "QC failed", done as () => void);
  const rework = useManufacturingAction(() => manufacturingApi.rework(order.id), "Sent back for rework", done as () => void);
  const cancel = useManufacturingAction(() => manufacturingApi.cancelProduction(order.id, reason.trim() || undefined), "Cancelled", done as () => void);
  const create = can(P.PRODUCTION_CREATE);
  const approve = can(P.PRODUCTION_APPROVE);
  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4" data-testid="mo-detail">
      <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-h4 font-semibold">{order.productionOrderNo} <span className="font-normal text-muted">· {order.designName} ({order.sku}) × {order.quantity}</span></h3><Status s={order.status} /></div>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-body-sm sm:grid-cols-4">
        <div><dt className="text-muted">BOM</dt><dd>{order.bom.purity} · {grams(order.bom.expectedGrossWeight)} · wastage {grams(order.bom.expectedWastage)}</dd></div>
        <div><dt className="text-muted">Issued</dt><dd>{grams(order.issuedGrossWeight)}</dd></div>
        {order.actualGrossWeight !== undefined && <div><dt className="text-muted">Actual</dt><dd>{grams(order.actualGrossWeight)} · wastage {grams(order.actualWastage)}</dd></div>}
        {order.labourCost !== undefined && <div><dt className="text-muted">Labour cost</dt><dd>{money(order.labourCost)}</dd></div>}
      </dl>
      {order.qc && <p className="text-body-sm">QC: <Status s={order.qc.status} />{order.qc.notes && ` — ${order.qc.notes}`}{order.qc.byName && ` (${order.qc.byName})`}</p>}
      {order.reconciliation && <ReconciliationStrip r={order.reconciliation} />}
      {err && <p className="text-body-sm text-danger" role="alert" data-testid="mo-error">{err}</p>}
      <div className="flex flex-wrap gap-2">
        {create && order.status === "DRAFT" && <button className={btn("primary")} onClick={() => setMode("issue")} data-testid="mo-issue">Issue material…</button>}
        {create && order.status === "MATERIAL_ISSUED" && <button className={btn("primary")} onClick={() => run(start)} data-testid="mo-start">Start manufacturing</button>}
        {create && order.status === "IN_PROGRESS" && <button className={btn("primary")} onClick={() => setMode("qc")} data-testid="mo-submit-qc">Submit for QC…</button>}
        {approve && order.status === "QC_PENDING" && <button className={btn("primary")} onClick={() => run(passQc)} data-testid="mo-qc-pass">Pass QC</button>}
        {approve && order.status === "QC_PENDING" && <span className="flex items-center gap-2"><input className={inputCls} placeholder="Reason for failing" value={failNotes} onChange={(e) => setFailNotes(e.target.value)} data-testid="mo-qc-fail-notes" /><button className={btn("danger")} disabled={!failNotes.trim()} onClick={() => run(failQc)} data-testid="mo-qc-fail">Fail QC</button></span>}
        {create && order.status === "QC_FAILED" && <button className={btn()} onClick={() => run(rework)} data-testid="mo-rework">Send back for rework</button>}
        {approve && order.status === "QC_PASSED" && <button className={btn("primary")} onClick={() => setMode("complete")} data-testid="mo-complete">Complete…</button>}
        {create && ["DRAFT", "MATERIAL_ISSUED", "IN_PROGRESS", "QC_FAILED"].includes(order.status) && <button className={btn("danger")} onClick={() => setMode("cancel")} data-testid="mo-cancel">Cancel…</button>}
      </div>
      {mode === "issue" && <IssueMaterial order={order} onDone={done} />}
      {mode === "qc" && <SubmitQc order={order} onDone={done} />}
      {mode === "complete" && <CompleteForm order={order} onDone={done} />}
      {mode === "cancel" && (
        <div className="flex flex-col gap-2 rounded-md border border-border-subtle p-3">
          <Field label="Reason"><input className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} data-testid="mo-cancel-reason" /></Field>
          <div className="flex gap-2"><button className={btn("danger")} disabled={cancel.isPending} onClick={() => run(cancel)} data-testid="mo-cancel-go">Cancel order</button><button className={btn()} onClick={() => setMode("")}>Close</button></div>
        </div>
      )}
    </div>
  );
}

export function ProductionOrdersView() {
  const [g, setG] = React.useState("");
  const [creating, setCreating] = React.useState(false);
  const q = useProductionOrders(g || undefined);
  const [sel, setSel] = React.useState<string>();
  const items = q.data ?? [];
  const current = items.find((p) => p.id === sel);
  const { can } = useAuth();
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Filter">{GROUPS.map(([v, l]) => <button key={l} role="tab" aria-selected={g === v} className={`h-8 rounded-full border px-3 text-caption ${g === v ? "border-foreground bg-foreground text-background" : "border-border bg-surface"}`} onClick={() => setG(v)}>{l}</button>)}</div>
        {can(P.PRODUCTION_CREATE) && <button className={btn("primary")} onClick={() => setCreating((v) => !v)} data-testid="mo-new">{creating ? "Close" : "New production order"}</button>}
      </div>
      {creating && <NewProductionOrderForm onDone={() => { setCreating(false); q.refetch(); }} />}
      <Load q={q}>
        {items.length === 0 ? <p className="rounded-lg border border-dashed border-border p-10 text-center text-muted">Nothing here.</p> : (
          <Table testId="mo-table"><thead><tr><Th>MO</Th><Th>Design</Th><Th right>Qty</Th><Th right>Issued</Th><Th>Status</Th></tr></thead><tbody>
            {items.map((p) => <tr key={p.id} className={`cursor-pointer hover:bg-surface-sunken ${sel === p.id ? "bg-surface-sunken" : ""}`} onClick={() => setSel(p.id)} data-testid="mo-row"><Td className="font-medium">{p.productionOrderNo}</Td><Td>{p.designName}</Td><Td right>{p.quantity}</Td><Td right>{grams(p.issuedGrossWeight)}</Td><Td><Status s={p.status} /></Td></tr>)}
          </tbody></Table>
        )}
      </Load>
      {current && <Detail key={current.id + current.status} order={current} onDone={() => q.refetch()} />}
    </div>
  );
}
