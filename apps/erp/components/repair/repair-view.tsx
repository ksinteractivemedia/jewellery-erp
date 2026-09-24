"use client";

import * as React from "react";
import { Wrench } from "lucide-react";
import { EmptyState, PageHeader } from "@jewellery/ui";
import { PERMISSIONS as P } from "@jewellery/types";
import type { RepairOrder } from "@jewellery/types";
import { useAuth } from "../../lib/auth/auth-context";
import { useCatalogMeta } from "../../lib/api/queries";
import { useInventoryMeta } from "../../lib/api/inventory-queries";
import { repairApi, useRepairAction, useRepairDashboard, useRepairOrders } from "../../lib/api/repair";
import { errorMessage } from "../../lib/api/queries";
import { Field, Load, SoldItemPicker, Status, Table, Td, Th, btn, day, grams, inputCls, rupees } from "./shared";

const TABS = [["", "All"], ["INTAKE", "Intake"], ["ESTIMATED", "Estimated"], ["IN_PROGRESS", "In progress"], ["QC_PENDING", "QC"], ["READY", "Ready"], ["DELIVERED", "Delivered"]] as const;

function Stat({ label, value, tone }: { label: string; value: React.ReactNode; tone?: "warning" | "danger" }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <p className="text-body-sm text-muted">{label}</p>
      <p className={`mt-1 text-h3 font-display tabular ${tone === "warning" ? "text-warning" : tone === "danger" ? "text-danger" : "text-foreground"}`}>{value}</p>
    </div>
  );
}

function NewRepairForm({ onDone }: { onDone: (ro: RepairOrder) => void }) {
  const meta = useCatalogMeta();
  const invMeta = useInventoryMeta();
  const metals = meta.data?.metals ?? [];
  const repairLocations = (invMeta.data?.locations ?? []).filter((l) => l.type === "REPAIR_CENTER");
  const [existing, setExisting] = React.useState(true);
  const [itemId, setItemId] = React.useState("");
  const [name, setName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [itemDescription, setItemDescription] = React.useState("");
  const [metalId, setMetalId] = React.useState("");
  const [purity, setPurity] = React.useState("");
  const [grossWeight, setGrossWeight] = React.useState("");
  const [stoneWeight, setStoneWeight] = React.useState("0");
  const [locationId, setLocationId] = React.useState("");
  const [dueDate, setDueDate] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [err, setErr] = React.useState<string>();
  const intake = useRepairAction(repairApi.intake, "Repair intake recorded", (ro) => onDone(ro as RepairOrder));
  const metal = metals.find((m) => m.id === metalId);
  const canSubmit = name.trim() && phone.trim() && itemDescription.trim() && locationId && (existing ? itemId : metalId && purity && grossWeight);

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4" data-testid="new-repair-form">
      <h3 className="text-h4 font-semibold">Repair intake</h3>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Customer name"><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} data-testid="rp-customer-name" /></Field>
        <Field label="Phone"><input className={inputCls} value={phone} onChange={(e) => setPhone(e.target.value)} data-testid="rp-customer-phone" /></Field>
        <Field label="Email (optional)"><input className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} data-testid="rp-customer-email" /></Field>
      </div>
      <Field label="Item description"><input className={inputCls} value={itemDescription} onChange={(e) => setItemDescription(e.target.value)} data-testid="rp-item-description" /></Field>
      <div className="flex gap-4 text-body-sm">
        <label className="flex items-center gap-2"><input type="radio" checked={existing} onChange={() => setExisting(true)} data-testid="rp-mode-existing" />A piece we already sold this customer</label>
        <label className="flex items-center gap-2"><input type="radio" checked={!existing} onChange={() => setExisting(false)} data-testid="rp-mode-new" />Something we&apos;ve never held (customer-owned)</label>
      </div>
      {existing ? (
        <SoldItemPicker selected={itemId} onChange={setItemId} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Metal">
            <select className={inputCls} value={metalId} onChange={(e) => { setMetalId(e.target.value); setPurity(""); }} data-testid="rp-metal">
              <option value="">Choose…</option>
              {metals.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </Field>
          <Field label="Purity">
            <select className={inputCls} value={purity} onChange={(e) => setPurity(e.target.value)} disabled={!metal} data-testid="rp-purity">
              <option value="">Choose…</option>
              {(metal?.purities ?? []).map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </Field>
          <Field label="Gross weight (g)"><input type="number" step="0.001" className={inputCls} value={grossWeight} onChange={(e) => setGrossWeight(e.target.value)} data-testid="rp-gross" /></Field>
          <Field label="Stone weight (g)"><input type="number" step="0.001" className={inputCls} value={stoneWeight} onChange={(e) => setStoneWeight(e.target.value)} data-testid="rp-stone" /></Field>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Repair centre">
          <select className={inputCls} value={locationId} onChange={(e) => setLocationId(e.target.value)} data-testid="rp-location">
            <option value="">Choose…</option>
            {repairLocations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </Field>
        <Field label="Due date (optional)"><input type="date" className={inputCls} value={dueDate} onChange={(e) => setDueDate(e.target.value)} data-testid="rp-due-date" /></Field>
        <Field label="Notes"><input className={inputCls} value={notes} onChange={(e) => setNotes(e.target.value)} data-testid="rp-notes" /></Field>
      </div>
      {err && <p className="text-body-sm text-danger" role="alert" data-testid="repair-form-error">{err}</p>}
      <div className="flex gap-2">
        <button
          className={btn("primary")}
          disabled={!canSubmit || intake.isPending}
          onClick={() =>
            intake.mutate(
              {
                customer: { name: name.trim(), phone: phone.trim(), ...(email.trim() ? { email: email.trim() } : {}) },
                itemDescription: itemDescription.trim(),
                locationId,
                ...(existing ? { itemId } : { metalId, purity, grossWeight: Number(grossWeight), stoneWeight: Number(stoneWeight || 0) }),
                ...(dueDate ? { dueDate } : {}),
                ...(notes.trim() ? { notes: notes.trim() } : {}),
              } as never,
              { onError: (e) => setErr(errorMessage(e)) }
            )
          }
          data-testid="repair-save"
        >
          Take in for repair
        </button>
      </div>
    </div>
  );
}

function EstimateForm({ ro, onDone, onCancel }: { ro: RepairOrder; onDone: () => void; onCancel: () => void }) {
  const [labourCharge, setLabourCharge] = React.useState("");
  const [materialsCharge, setMaterialsCharge] = React.useState("0");
  const [otherCharges, setOtherCharges] = React.useState("0");
  const [notes, setNotes] = React.useState("");
  const [err, setErr] = React.useState<string>();
  const estimate = useRepairAction((v: Parameters<typeof repairApi.estimate>[1]) => repairApi.estimate(ro.id, v), "Estimate recorded", onDone);
  return (
    <div className="flex flex-col gap-2 rounded-md border border-border-subtle p-3" data-testid="estimate-form">
      <div className="grid gap-3 sm:grid-cols-4">
        <Field label="Labour (₹)"><input type="number" step="0.01" className={inputCls} value={labourCharge} onChange={(e) => setLabourCharge(e.target.value)} data-testid="estimate-labour" /></Field>
        <Field label="Materials (₹)"><input type="number" step="0.01" className={inputCls} value={materialsCharge} onChange={(e) => setMaterialsCharge(e.target.value)} data-testid="estimate-materials" /></Field>
        <Field label="Other (₹)"><input type="number" step="0.01" className={inputCls} value={otherCharges} onChange={(e) => setOtherCharges(e.target.value)} data-testid="estimate-other" /></Field>
        <Field label="Notes"><input className={inputCls} value={notes} onChange={(e) => setNotes(e.target.value)} data-testid="estimate-notes" /></Field>
      </div>
      {err && <p className="text-body-sm text-danger" role="alert">{err}</p>}
      <div className="flex gap-2">
        <button
          className={btn("primary")}
          disabled={!labourCharge || estimate.isPending}
          onClick={() =>
            estimate.mutate(
              { labourCharge: Math.round(Number(labourCharge) * 100), materialsCharge: Math.round(Number(materialsCharge || 0) * 100), otherCharges: Math.round(Number(otherCharges || 0) * 100), ...(notes.trim() ? { notes: notes.trim() } : {}) } as never,
              { onError: (e) => setErr(errorMessage(e)) }
            )
          }
          data-testid="estimate-go"
        >
          Save estimate
        </button>
        <button className={btn()} onClick={onCancel}>Close</button>
      </div>
    </div>
  );
}

function WorkForm({ ro, onDone, onCancel }: { ro: RepairOrder; onDone: () => void; onCancel: () => void }) {
  const [afterGrossWeight, setAfterGrossWeight] = React.useState(String(ro.beforeWeight?.grossWeight ?? ""));
  const [afterStoneWeight, setAfterStoneWeight] = React.useState("0");
  const [stoneWork, setStoneWork] = React.useState(ro.stoneWork ?? "");
  const [err, setErr] = React.useState<string>();
  const work = useRepairAction((v: Parameters<typeof repairApi.recordWork>[1]) => repairApi.recordWork(ro.id, v), "Work recorded", onDone);
  return (
    <div className="flex flex-col gap-2 rounded-md border border-border-subtle p-3" data-testid="work-form">
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="After gross weight (g)"><input type="number" step="0.001" className={inputCls} value={afterGrossWeight} onChange={(e) => setAfterGrossWeight(e.target.value)} data-testid="work-gross" /></Field>
        <Field label="After stone weight (g)"><input type="number" step="0.001" className={inputCls} value={afterStoneWeight} onChange={(e) => setAfterStoneWeight(e.target.value)} data-testid="work-stone" /></Field>
        <Field label="Stone work done"><input className={inputCls} value={stoneWork} onChange={(e) => setStoneWork(e.target.value)} data-testid="work-stonework" /></Field>
      </div>
      <p className="text-caption text-muted">Charges default to the approved estimate unless adjusted here.</p>
      {err && <p className="text-body-sm text-danger" role="alert">{err}</p>}
      <div className="flex gap-2">
        <button
          className={btn("primary")}
          disabled={!afterGrossWeight || work.isPending}
          onClick={() => work.mutate({ afterGrossWeight: Number(afterGrossWeight), afterStoneWeight: Number(afterStoneWeight || 0), ...(stoneWork.trim() ? { stoneWork: stoneWork.trim() } : {}) } as never, { onError: (e) => setErr(errorMessage(e)) })}
          data-testid="work-go"
        >
          Save work done
        </button>
        <button className={btn()} onClick={onCancel}>Close</button>
      </div>
    </div>
  );
}

function Detail({ ro, onDone }: { ro: RepairOrder; onDone: () => void }) {
  const { can } = useAuth();
  const [mode, setMode] = React.useState<"none" | "inspect" | "estimate" | "approve" | "decline" | "work" | "qcfail" | "cancel">("none");
  const [text, setText] = React.useState("");
  const [err, setErr] = React.useState<string>();
  const done = () => { setMode("none"); setText(""); setErr(undefined); onDone(); };
  const fail = (e: unknown) => setErr(errorMessage(e));
  const inspect = useRepairAction(() => repairApi.inspect(ro.id, { inspectionNotes: text.trim() || undefined }), "Inspected", done);
  const approveEstimate = useRepairAction(() => repairApi.decideEstimate(ro.id, { approved: true }), "Estimate approved", done);
  const declineEstimate = useRepairAction(() => repairApi.decideEstimate(ro.id, { approved: false, note: text.trim() || undefined }), "Estimate declined — piece handed back", done);
  const start = useRepairAction(() => repairApi.start(ro.id), "Repair started", done);
  const qcPass = useRepairAction(() => repairApi.qcPass(ro.id, text.trim() || undefined), "QC passed — ready for pickup", done);
  const qcFail = useRepairAction(() => repairApi.qcFail(ro.id, text.trim()), "QC failed — sent back for rework", done);
  const rework = useRepairAction(() => repairApi.rework(ro.id, text.trim() || undefined), "Back in progress", done);
  const deliver = useRepairAction(() => repairApi.deliver(ro.id, text.trim() || undefined), "Delivered to customer", done);
  const cancel = useRepairAction(() => repairApi.cancel(ro.id, text.trim() || undefined), "Cancelled — piece handed back", done);

  const write = can(P.REPAIR_CREATE);
  const qcPerm = can(P.REPAIR_APPROVE);

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4" data-testid="repair-detail">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-h4 font-semibold">{ro.repairNo} <span className="font-normal text-muted">· {ro.customer.name}</span></h3>
        <Status s={ro.status} />
      </div>
      <p className="text-body-sm text-muted">{ro.itemCode} — {ro.itemDescription}{ro.purity && ` · ${ro.purity}`}{ro.huid && ` · HUID ${ro.huid}`}</p>
      {ro.beforeWeight && <p className="text-body-sm">Before: {grams(ro.beforeWeight.grossWeight)} gross, {grams(ro.beforeWeight.stoneWeight)} stone</p>}
      {ro.afterWeight && <p className="text-body-sm">After: {grams(ro.afterWeight.grossWeight)} gross, {grams(ro.afterWeight.stoneWeight)} stone</p>}
      {ro.inspectionNotes && <p className="text-body-sm">Inspection: {ro.inspectionNotes}</p>}
      {ro.estimate && <p className="text-body-sm">Estimate: labour {rupees(ro.estimate.labourCharge)} + materials {rupees(ro.estimate.materialsCharge)} + other {rupees(ro.estimate.otherCharges)} = <strong>{rupees(ro.estimate.total)}</strong>{ro.estimate.notes && ` — ${ro.estimate.notes}`}</p>}
      {ro.approval && <p className="text-body-sm">Customer {ro.approval.approved ? "approved" : "declined"} the estimate{ro.approval.byName && ` (${ro.approval.byName})`}{ro.approval.note && ` — ${ro.approval.note}`}</p>}
      {ro.qc && <p className={`text-body-sm ${ro.qc.result === "FAILED" ? "text-danger" : "text-success"}`}>QC {ro.qc.result.toLowerCase()}{ro.qc.notes && ` — ${ro.qc.notes}`}</p>}
      {ro.finalCharges && <p className="text-body-sm">Final charges: <strong>{rupees(ro.finalCharges.total)}</strong></p>}
      {ro.dueDate && <p className="text-body-sm text-muted">Due {day(ro.dueDate)}</p>}

      {err && <p className="text-body-sm text-danger" role="alert" data-testid="repair-error">{err}</p>}
      <div className="flex flex-wrap gap-2">
        {write && ro.status === "INTAKE" && <button className={btn("primary")} onClick={() => setMode("inspect")} data-testid="repair-inspect">Inspect…</button>}
        {write && (ro.status === "INSPECTED" || ro.status === "ESTIMATED") && <button className={btn("primary")} onClick={() => setMode("estimate")} data-testid="repair-estimate">{ro.status === "ESTIMATED" ? "Re-estimate…" : "Estimate…"}</button>}
        {write && ro.status === "ESTIMATED" && <button className={btn("primary")} disabled={approveEstimate.isPending} onClick={() => approveEstimate.mutate(undefined, { onError: fail })} data-testid="repair-approve-estimate">Customer approved</button>}
        {write && ro.status === "ESTIMATED" && <button className={btn("danger")} onClick={() => setMode("decline")} data-testid="repair-decline-estimate">Customer declined…</button>}
        {write && ro.status === "APPROVED" && <button className={btn("primary")} disabled={start.isPending} onClick={() => start.mutate(undefined, { onError: fail })} data-testid="repair-start">Start repair</button>}
        {write && ro.status === "IN_PROGRESS" && <button className={btn("primary")} onClick={() => setMode("work")} data-testid="repair-work">Record work done…</button>}
        {qcPerm && ro.status === "QC_PENDING" && <button className={btn("primary")} disabled={qcPass.isPending} onClick={() => qcPass.mutate(undefined, { onError: fail })} data-testid="repair-qc-pass">QC pass</button>}
        {qcPerm && ro.status === "QC_PENDING" && <button className={btn("danger")} onClick={() => setMode("qcfail")} data-testid="repair-qc-fail">QC fail…</button>}
        {write && ro.status === "QC_FAILED" && <button className={btn("primary")} disabled={rework.isPending} onClick={() => rework.mutate(undefined, { onError: fail })} data-testid="repair-rework">Send back for rework</button>}
        {write && ro.status === "READY" && <button className={btn("primary")} disabled={deliver.isPending} onClick={() => deliver.mutate(undefined, { onError: fail })} data-testid="repair-deliver">Deliver to customer</button>}
        {write && ro.canCancel && <button className={btn("danger")} onClick={() => setMode("cancel")} data-testid="repair-cancel">Cancel…</button>}
      </div>

      {mode === "inspect" && (
        <div className="flex flex-col gap-2 rounded-md border border-border-subtle p-3">
          <Field label="Inspection notes"><textarea className={`${inputCls} h-auto py-2`} rows={2} value={text} onChange={(e) => setText(e.target.value)} data-testid="inspect-notes" /></Field>
          <div className="flex gap-2"><button className={btn("primary")} disabled={inspect.isPending} onClick={() => inspect.mutate(undefined, { onError: fail })} data-testid="inspect-go">Save</button><button className={btn()} onClick={() => setMode("none")}>Close</button></div>
        </div>
      )}
      {mode === "estimate" && <EstimateForm ro={ro} onDone={done} onCancel={() => setMode("none")} />}
      {mode === "decline" && (
        <div className="flex flex-col gap-2 rounded-md border border-border-subtle p-3">
          <Field label="Note (optional)"><input className={inputCls} value={text} onChange={(e) => setText(e.target.value)} data-testid="decline-note" /></Field>
          <div className="flex gap-2"><button className={btn("danger")} disabled={declineEstimate.isPending} onClick={() => declineEstimate.mutate(undefined, { onError: fail })} data-testid="decline-go">Confirm decline — hand piece back</button><button className={btn()} onClick={() => setMode("none")}>Close</button></div>
        </div>
      )}
      {mode === "work" && <WorkForm ro={ro} onDone={done} onCancel={() => setMode("none")} />}
      {mode === "qcfail" && (
        <div className="flex flex-col gap-2 rounded-md border border-border-subtle p-3">
          <Field label="What failed"><input className={inputCls} value={text} onChange={(e) => setText(e.target.value)} data-testid="qcfail-notes" /></Field>
          <div className="flex gap-2"><button className={btn("danger")} disabled={qcFail.isPending || !text.trim()} onClick={() => qcFail.mutate(undefined, { onError: fail })} data-testid="qcfail-go">Confirm fail</button><button className={btn()} onClick={() => setMode("none")}>Close</button></div>
        </div>
      )}
      {mode === "cancel" && (
        <div className="flex flex-col gap-2 rounded-md border border-border-subtle p-3">
          <Field label="Reason (optional)"><input className={inputCls} value={text} onChange={(e) => setText(e.target.value)} data-testid="repair-cancel-reason" /></Field>
          <div className="flex gap-2"><button className={btn("danger")} disabled={cancel.isPending} onClick={() => cancel.mutate(undefined, { onError: fail })} data-testid="repair-cancel-go">Confirm cancel — hand piece back</button><button className={btn()} onClick={() => setMode("none")}>Close</button></div>
        </div>
      )}
      {ro.history.length > 0 && (
        <div className="flex flex-col gap-1 border-t border-border-subtle pt-3">
          <h4 className="text-caption font-semibold uppercase tracking-wide text-muted">History</h4>
          {ro.history.map((h, i) => <p key={i} className="text-caption text-muted">{day(h.at)} — {h.status.replace(/_/g, " ").toLowerCase()} by {h.byName ?? "system"}{h.note && ` — ${h.note}`}</p>)}
        </div>
      )}
    </div>
  );
}

export function RepairView() {
  const [tab, setTab] = React.useState<string>("");
  const [creating, setCreating] = React.useState(false);
  const [sel, setSel] = React.useState<string>();
  const dash = useRepairDashboard();
  const q = useRepairOrders(tab ? { status: tab } : {});
  const { can } = useAuth();
  const current = (q.data ?? []).find((r) => r.id === sel);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Repairs" description="Customer → repair intake → inspection → estimate → approval → repair → QC → ready → delivery/pickup." />
      <Load q={dash} rows={3}>
        {dash.data && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            <Stat label="Intake" value={dash.data.counts.INTAKE} tone={dash.data.counts.INTAKE ? "warning" : undefined} />
            <Stat label="Estimated" value={dash.data.counts.ESTIMATED} />
            <Stat label="In progress" value={dash.data.counts.IN_PROGRESS} />
            <Stat label="QC pending" value={dash.data.counts.QC_PENDING} tone={dash.data.counts.QC_PENDING ? "warning" : undefined} />
            <Stat label="QC failed" value={dash.data.counts.QC_FAILED} tone={dash.data.counts.QC_FAILED ? "danger" : undefined} />
            <Stat label="Ready" value={dash.data.counts.READY} tone={dash.data.counts.READY ? "warning" : undefined} />
          </div>
        )}
      </Load>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Filter">
          {TABS.map(([v, l]) => <button key={l} role="tab" aria-selected={tab === v} className={`h-8 rounded-full border px-3 text-caption ${tab === v ? "border-foreground bg-foreground text-background" : "border-border bg-surface"}`} onClick={() => setTab(v)} data-testid={`tab-${l.toLowerCase().replace(/\s+/g, "-")}`}>{l}</button>)}
        </div>
        {can(P.REPAIR_CREATE) && <button className={btn("primary")} onClick={() => setCreating((v) => !v)} data-testid="repair-new">{creating ? "Close" : "Repair intake"}</button>}
      </div>
      {creating && <NewRepairForm onDone={(ro) => { setCreating(false); setSel(ro.id); q.refetch(); dash.refetch(); }} />}
      <Load q={q}>
        {(q.data ?? []).length === 0 ? <EmptyState icon={<Wrench className="h-8 w-8" />} title="No repairs match" description="Try a different filter, or start a repair intake for a sold piece." /> : (
          <Table testId="repairs-table"><thead><tr><Th>Repair</Th><Th>Customer</Th><Th>Item</Th><Th>Due</Th><Th>Status</Th></tr></thead><tbody>
            {(q.data ?? []).map((r) => (
              <tr key={r.id} className={`cursor-pointer hover:bg-surface-sunken ${sel === r.id ? "bg-surface-sunken" : ""}`} onClick={() => setSel(r.id)} data-testid="repair-row">
                <Td className="font-medium">{r.repairNo}</Td>
                <Td>{r.customer.name}</Td>
                <Td>{r.itemCode} <span className="text-muted">{r.itemDescription}</span></Td>
                <Td>{r.dueDate ? day(r.dueDate) : "—"}</Td>
                <Td><Status s={r.status} /></Td>
              </tr>
            ))}
          </tbody></Table>
        )}
      </Load>
      {current && <Detail key={current.id + current.status} ro={current} onDone={() => { q.refetch(); dash.refetch(); }} />}
    </div>
  );
}
