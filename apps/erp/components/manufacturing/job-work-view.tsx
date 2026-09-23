"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import type { JobWorkOrder } from "@jewellery/types";
import { PERMISSIONS as P } from "@jewellery/types";
import { useAuth } from "../../lib/auth/auth-context";
import { catalogApi } from "../../lib/api/catalog";
import { useInventoryMeta } from "../../lib/api/inventory-queries";
import { manufacturingApi, useJobWorkOrders, useManufacturingAction } from "../../lib/api/manufacturing";
import { useSuppliers } from "../../lib/api/purchasing";
import { errorMessage } from "../../lib/api/queries";
import { Field, Load, ReconciliationStrip, Status, Table, Td, Th, btn, day, grams, inputCls, money, rupeesToPaise } from "./shared";
import { ItemPicker } from "./item-picker";

const GROUPS: [string, string][] = [["", "All"], ["DRAFT", "Draft"], ["ISSUED,PARTIALLY_RETURNED", "With the vendor"], ["RETURNED", "Closed"], ["CANCELLED", "Cancelled"]];

function NewJobWorkOrderForm({ onDone }: { onDone: () => void }) {
  const vendors = useSuppliers();
  const products = useQuery({ queryKey: ["catalog", "products", "picker"], queryFn: () => catalogApi.listProducts({ pageSize: 100, sort: "name", order: "asc" } as never), staleTime: 60_000 });
  const meta = useInventoryMeta();
  const [vendorId, setVendorId] = React.useState("");
  const [productId, setProductId] = React.useState("");
  const [issueDate, setIssueDate] = React.useState(new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10));
  const [dueDate, setDueDate] = React.useState("");
  const [metalId, setMetalId] = React.useState("");
  const [purity, setPurity] = React.useState("");
  const [expectedGrossWeight, setExpectedGrossWeight] = React.useState("");
  const [expectedWastage, setExpectedWastage] = React.useState("");
  const [makingCharges, setMakingCharges] = React.useState("");
  const [locationId, setLocationId] = React.useState("");
  const [err, setErr] = React.useState<string>();
  const purities = meta.data?.metals.find((m) => m.id === metalId)?.purities ?? [];
  const jobWorkerLocations = (meta.data?.locations ?? []).filter((l) => l.type === "JOB_WORKER");
  const create = useManufacturingAction(manufacturingApi.createJobWorkOrder, "Job work order created", onDone);
  const canSubmit = vendorId && metalId && purity && Number(expectedGrossWeight) > 0 && locationId && issueDate && dueDate;
  return (
    <div className="grid gap-3 rounded-lg border border-border bg-surface p-4 sm:grid-cols-3" data-testid="new-jw-form">
      <h3 className="text-h4 font-semibold sm:col-span-3">New job work order</h3>
      <Field label="Vendor / job worker"><select className={inputCls} value={vendorId} onChange={(e) => setVendorId(e.target.value)} data-testid="jw-vendor"><option value="">Choose…</option>{(vendors.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
      <Field label="Design (optional)"><select className={inputCls} value={productId} onChange={(e) => setProductId(e.target.value)} data-testid="jw-product"><option value="">—</option>{(products.data?.items ?? []).map((p: { id: string; name: string; sku: string }) => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}</select></Field>
      <Field label="Job worker location"><select className={inputCls} value={locationId} onChange={(e) => setLocationId(e.target.value)} data-testid="jw-location"><option value="">Choose…</option>{jobWorkerLocations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></Field>
      <Field label="Issue date"><input type="date" className={inputCls} value={issueDate} onChange={(e) => setIssueDate(e.target.value)} data-testid="jw-issue-date" /></Field>
      <Field label="Due date"><input type="date" className={inputCls} value={dueDate} onChange={(e) => setDueDate(e.target.value)} data-testid="jw-due-date" /></Field>
      <Field label="Making charges (₹)"><input className={inputCls} inputMode="decimal" value={makingCharges} onChange={(e) => setMakingCharges(e.target.value)} data-testid="jw-making-charges" /></Field>
      <Field label="Metal"><select className={inputCls} value={metalId} onChange={(e) => { setMetalId(e.target.value); setPurity(""); }} data-testid="jw-metal"><option value="">Choose…</option>{(meta.data?.metals ?? []).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></Field>
      <Field label="Purity"><select className={inputCls} value={purity} onChange={(e) => setPurity(e.target.value)} data-testid="jw-purity"><option value="">Choose…</option>{purities.map((p) => <option key={p} value={p}>{p}</option>)}</select></Field>
      <Field label="Expected gross weight (g)"><input className={inputCls} inputMode="decimal" value={expectedGrossWeight} onChange={(e) => setExpectedGrossWeight(e.target.value)} data-testid="jw-expected-weight" /></Field>
      <Field label="Expected wastage (g)"><input className={inputCls} inputMode="decimal" value={expectedWastage} onChange={(e) => setExpectedWastage(e.target.value)} data-testid="jw-expected-wastage" /></Field>
      {err && <p className="text-body-sm text-danger sm:col-span-3" role="alert">{err}</p>}
      <div className="sm:col-span-3">
        <button
          className={btn("primary")}
          disabled={!canSubmit || create.isPending}
          onClick={() =>
            create.mutate(
              { vendorId, ...(productId ? { productId } : {}), issueDate, dueDate, locationId, makingCharges: rupeesToPaise(makingCharges) ?? 0, bom: { metalId, purity, expectedGrossWeight: Number(expectedGrossWeight), expectedWastage: Number(expectedWastage) || 0, stonesRequired: [] } } as never,
              { onError: (e) => setErr(errorMessage(e)) }
            )
          }
          data-testid="jw-save"
        >
          Create job work order
        </button>
      </div>
    </div>
  );
}

function IssueToVendor({ order, onDone }: { order: JobWorkOrder; onDone: () => void }) {
  const [selected, setSelected] = React.useState<string[]>([]);
  const [err, setErr] = React.useState<string>();
  const issue = useManufacturingAction(() => manufacturingApi.issueJobWork(order.id, selected), "Issued to the job worker", onDone);
  return (
    <div className="flex flex-col gap-3 rounded-md border border-primary p-3" data-testid="jw-issue-form">
      <p className="text-body-sm text-muted">Needs ~{grams(order.bom.expectedGrossWeight)} of {order.bom.purity}. Pick whole pieces close to that.</p>
      <ItemPicker metalId={order.bom.metalId} purity={order.bom.purity} selected={selected} onChange={setSelected} />
      {err && <p className="text-body-sm text-danger" role="alert">{err}</p>}
      <div><button className={btn("primary")} disabled={!selected.length || issue.isPending} onClick={() => issue.mutate(undefined, { onError: (e) => setErr(errorMessage(e)) })} data-testid="jw-issue-go">Issue {selected.length} item{selected.length === 1 ? "" : "s"}</button></div>
    </div>
  );
}

function ReturnForm({ order, onDone }: { order: JobWorkOrder; onDone: () => void }) {
  const [pieces, setPieces] = React.useState("0");
  const [grossWeight, setGrossWeight] = React.useState("");
  const [returnedItemIds, setReturnedItemIds] = React.useState<string[]>([]);
  const [wastage, setWastage] = React.useState("0");
  const [note, setNote] = React.useState("");
  const [final, setFinal] = React.useState(true);
  const [err, setErr] = React.useState<string>();
  const outstanding = order.issuedItems.filter((i) => !order.returnedItems.some((r) => r.itemId === i.itemId));
  const toggle = (id: string) => setReturnedItemIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  const returnGoods = useManufacturingAction(
    () =>
      manufacturingApi.returnJobWork(order.id, {
        finishedPieces: Number(pieces) > 0 && Number(grossWeight) > 0 ? [{ quantity: Number(pieces), grossWeight: Number(grossWeight) }] : [],
        returnedItemIds,
        wastage: Number(wastage) || 0,
        final,
        ...(note.trim() ? { discrepancyNote: note.trim() } : {}),
      }),
    final ? "Job work order closed" : "Partial return recorded",
    onDone
  );
  return (
    <div className="flex flex-col gap-3 rounded-md border border-primary p-3" data-testid="jw-return-form">
      <p className="font-semibold">Finished piece(s) received (optional this round)</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Pieces"><input className={inputCls} inputMode="numeric" value={pieces} onChange={(e) => setPieces(e.target.value)} data-testid="jw-return-pieces" /></Field>
        <Field label="Gross weight each (g)"><input className={inputCls} inputMode="decimal" value={grossWeight} onChange={(e) => setGrossWeight(e.target.value)} data-testid="jw-return-weight" /></Field>
        <Field label="Wastage this round (g)"><input className={inputCls} inputMode="decimal" value={wastage} onChange={(e) => setWastage(e.target.value)} data-testid="jw-return-wastage" /></Field>
      </div>
      {outstanding.length > 0 && (
        <div>
          <p className="mb-1 text-body-sm font-medium">Return unused material</p>
          <ul className="flex flex-col gap-1">{outstanding.map((i) => <li key={i.itemId} className="flex items-center gap-2 text-body-sm"><input type="checkbox" checked={returnedItemIds.includes(i.itemId)} onChange={() => toggle(i.itemId)} id={`jwret-${i.itemId}`} /><label htmlFor={`jwret-${i.itemId}`}>{i.itemCode} — {grams(i.grossWeight)}</label></li>)}</ul>
        </div>
      )}
      <label className="flex items-center gap-2 text-body-sm"><input type="checkbox" checked={final} onChange={(e) => setFinal(e.target.checked)} data-testid="jw-return-final" />This closes the order — nothing more is coming back</label>
      <Field label="Discrepancy note (required if closing and the numbers don't balance)"><input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} data-testid="jw-return-note" /></Field>
      {err && <p className="text-body-sm text-danger" role="alert" data-testid="jw-return-error">{err}</p>}
      <div><button className={btn("primary")} disabled={returnGoods.isPending} onClick={() => returnGoods.mutate(undefined, { onError: (e) => setErr(errorMessage(e)) })} data-testid="jw-return-go">{final ? "Close order" : "Record partial return"}</button></div>
    </div>
  );
}

function Detail({ order, onDone }: { order: JobWorkOrder; onDone: () => void }) {
  const { can } = useAuth();
  const [mode, setMode] = React.useState<"" | "issue" | "return" | "cancel">("");
  const [reason, setReason] = React.useState("");
  const [err, setErr] = React.useState<string>();
  const done = () => { setMode(""); setErr(undefined); onDone(); };
  const create = can(P.PRODUCTION_CREATE);
  const approve = can(P.PRODUCTION_APPROVE);
  const cancel = useManufacturingAction(() => manufacturingApi.cancelJobWork(order.id, reason.trim() || undefined), "Cancelled", done as () => void);
  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4" data-testid="jw-detail">
      <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-h4 font-semibold">{order.jobWorkOrderNo} <span className="font-normal text-muted">· {order.vendorName}</span></h3><Status s={order.status} /></div>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-body-sm sm:grid-cols-4">
        <div><dt className="text-muted">BOM</dt><dd>{order.bom.purity} · {grams(order.bom.expectedGrossWeight)} · wastage {grams(order.bom.expectedWastage)}</dd></div>
        <div><dt className="text-muted">Issued</dt><dd>{grams(order.issuedGrossWeight)}</dd></div>
        <div><dt className="text-muted">Issue → due</dt><dd>{day(order.issueDate)} → {day(order.dueDate)}</dd></div>
        <div><dt className="text-muted">Making charges</dt><dd>{money(order.makingCharges)}</dd></div>
      </dl>
      {order.reconciliation && <ReconciliationStrip r={order.reconciliation} />}
      {err && <p className="text-body-sm text-danger" role="alert" data-testid="jw-error">{err}</p>}
      <div className="flex flex-wrap gap-2">
        {create && order.status === "DRAFT" && <button className={btn("primary")} onClick={() => setMode("issue")} data-testid="jw-issue">Issue to vendor…</button>}
        {approve && ["ISSUED", "PARTIALLY_RETURNED"].includes(order.status) && <button className={btn("primary")} onClick={() => setMode("return")} data-testid="jw-return">Record return…</button>}
        {create && order.status === "DRAFT" && <button className={btn("danger")} onClick={() => setMode("cancel")} data-testid="jw-cancel">Cancel…</button>}
      </div>
      {mode === "issue" && <IssueToVendor order={order} onDone={done} />}
      {mode === "return" && <ReturnForm order={order} onDone={done} />}
      {mode === "cancel" && (
        <div className="flex flex-col gap-2 rounded-md border border-border-subtle p-3">
          <Field label="Reason"><input className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} data-testid="jw-cancel-reason" /></Field>
          <div className="flex gap-2"><button className={btn("danger")} disabled={cancel.isPending} onClick={() => cancel.mutate(undefined, { onError: (e) => setErr(errorMessage(e)) })} data-testid="jw-cancel-go">Cancel order</button><button className={btn()} onClick={() => setMode("")}>Close</button></div>
        </div>
      )}
      {order.finishedItems.length > 0 && (
        <div>
          <p className="mb-1 font-semibold">Finished items received</p>
          <Table><thead><tr><Th>Item</Th><Th right>Gross wt</Th></tr></thead><tbody>{order.finishedItems.map((i) => <tr key={i.itemId}><Td className="tabular">{i.itemCode}</Td><Td right>{grams(i.grossWeight)}</Td></tr>)}</tbody></Table>
        </div>
      )}
    </div>
  );
}

export function JobWorkView() {
  const [g, setG] = React.useState("");
  const [creating, setCreating] = React.useState(false);
  const q = useJobWorkOrders(g || undefined);
  const [sel, setSel] = React.useState<string>();
  const items = q.data ?? [];
  const current = items.find((p) => p.id === sel);
  const { can } = useAuth();
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Filter">{GROUPS.map(([v, l]) => <button key={l} role="tab" aria-selected={g === v} className={`h-8 rounded-full border px-3 text-caption ${g === v ? "border-foreground bg-foreground text-background" : "border-border bg-surface"}`} onClick={() => setG(v)}>{l}</button>)}</div>
        {can(P.PRODUCTION_CREATE) && <button className={btn("primary")} onClick={() => setCreating((v) => !v)} data-testid="jw-new">{creating ? "Close" : "New job work order"}</button>}
      </div>
      {creating && <NewJobWorkOrderForm onDone={() => { setCreating(false); q.refetch(); }} />}
      <Load q={q}>
        {items.length === 0 ? <p className="rounded-lg border border-dashed border-border p-10 text-center text-muted">Nothing here.</p> : (
          <Table testId="jw-table"><thead><tr><Th>JW</Th><Th>Vendor</Th><Th>Due</Th><Th right>Issued</Th><Th>Status</Th></tr></thead><tbody>
            {items.map((p) => <tr key={p.id} className={`cursor-pointer hover:bg-surface-sunken ${sel === p.id ? "bg-surface-sunken" : ""}`} onClick={() => setSel(p.id)} data-testid="jw-row"><Td className="font-medium">{p.jobWorkOrderNo}</Td><Td>{p.vendorName}</Td><Td>{day(p.dueDate)}</Td><Td right>{grams(p.issuedGrossWeight)}</Td><Td><Status s={p.status} /></Td></tr>)}
          </tbody></Table>
        )}
      </Load>
      {current && <Detail key={current.id + current.status} order={current} onDone={() => q.refetch()} />}
    </div>
  );
}
