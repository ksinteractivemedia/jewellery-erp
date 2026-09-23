"use client";

import * as React from "react";
import { PageHeader } from "@jewellery/ui";
import { PERMISSIONS as P } from "@jewellery/types";
import type { Return, ReturnLine } from "@jewellery/types";
import { useAuth } from "../../lib/auth/auth-context";
import { useInventoryMeta } from "../../lib/api/inventory-queries";
import { returnsApi, useReturnAction, useReturns, useReturnsDashboard } from "../../lib/api/returns";
import { errorMessage } from "../../lib/api/queries";
import { Field, Load, SoldItemPicker, Status, Table, Td, Th, btn, day, grams, inputCls, rupees } from "./shared";

const REASONS = ["DEFECTIVE", "WRONG_ITEM", "NOT_AS_DESCRIBED", "SIZE_ISSUE", "CHANGED_MIND", "OTHER"] as const;
const CONDITIONS = ["GOOD", "DAMAGED", "DEFECTIVE"] as const;
const SETTLEMENT_METHODS = ["REFUND", "STORE_CREDIT", "ADJUST_INVOICE"] as const;
const TABS = [["", "All"], ["REQUESTED", "Requested"], ["APPROVED", "Approved"], ["RECEIVED", "Received"], ["INSPECTED", "Inspected"], ["SETTLED", "Settled"]] as const;

function Stat({ label, value, tone }: { label: string; value: React.ReactNode; tone?: "warning" }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <p className="text-body-sm text-muted">{label}</p>
      <p className={`mt-1 text-h3 font-display tabular ${tone === "warning" ? "text-warning" : "text-foreground"}`}>{value}</p>
    </div>
  );
}

function NewReturnForm({ onDone }: { onDone: () => void }) {
  const [channel, setChannel] = React.useState<"B2C" | "B2B">("B2C");
  const [orderId, setOrderId] = React.useState("");
  const [itemIds, setItemIds] = React.useState<string[]>([]);
  const [reason, setReason] = React.useState<(typeof REASONS)[number]>("DEFECTIVE");
  const [reasonNote, setReasonNote] = React.useState("");
  const [err, setErr] = React.useState<string>();
  const create = useReturnAction(channel === "B2C" ? returnsApi.requestB2C : returnsApi.requestB2B, "Return requested", onDone);
  const canSubmit = orderId.trim().length === 24 && itemIds.length > 0;

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4" data-testid="new-return-form">
      <h3 className="text-h4 font-semibold">Request a return</h3>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Channel">
          <select className={inputCls} value={channel} onChange={(e) => setChannel(e.target.value as "B2C" | "B2B")} data-testid="return-channel">
            <option value="B2C">B2C order</option>
            <option value="B2B">B2B sales order</option>
          </select>
        </Field>
        <Field label={channel === "B2C" ? "Order id" : "Sales order id"}>
          <input className={inputCls} value={orderId} onChange={(e) => setOrderId(e.target.value.trim())} placeholder="24-character order id" data-testid="return-order-id" />
        </Field>
        <Field label="Reason">
          <select className={inputCls} value={reason} onChange={(e) => setReason(e.target.value as (typeof REASONS)[number])} data-testid="return-reason">
            {REASONS.map((r) => <option key={r} value={r}>{r.replace(/_/g, " ").toLowerCase()}</option>)}
          </select>
        </Field>
      </div>
      <SoldItemPicker selected={itemIds} onChange={setItemIds} />
      <Field label="Note (optional)"><textarea className={`${inputCls} h-auto py-2`} rows={2} value={reasonNote} onChange={(e) => setReasonNote(e.target.value)} data-testid="return-note" /></Field>
      {err && <p className="text-body-sm text-danger" role="alert" data-testid="return-form-error">{err}</p>}
      <div className="flex gap-2">
        <button
          className={btn("primary")}
          disabled={!canSubmit || create.isPending}
          onClick={() => create.mutate({ orderId, itemIds, reason, ...(reasonNote.trim() ? { reasonNote: reasonNote.trim() } : {}) } as never, { onError: (e) => setErr(errorMessage(e)) })}
          data-testid="return-save"
        >
          Request return{itemIds.length > 0 ? ` (${itemIds.length})` : ""}
        </button>
      </div>
      <p className="text-caption text-muted">The order id is the order&apos;s own internal id — a piece not actually sold on it is refused.</p>
    </div>
  );
}

function LineRow({ line }: { line: ReturnLine }) {
  return (
    <tr data-testid="return-line-row">
      <Td className="font-medium tabular">{line.itemCode}</Td>
      <Td>{line.sku} <span className="text-muted">{line.name}</span></Td>
      <Td right>{grams(line.grossWeight)}</Td>
      <Td className="font-mono">{line.huid ?? "—"}</Td>
      <Td right>{rupees(line.unitPrice)}</Td>
      <Td>{line.condition ? <Status s={line.condition} /> : "—"}{line.conditionNote && <span className="block text-caption text-muted">{line.conditionNote}</span>}</Td>
    </tr>
  );
}

function ReceiveForm({ ret, onDone, onCancel }: { ret: Return; onDone: () => void; onCancel: () => void }) {
  const meta = useInventoryMeta();
  const stockLocations = (meta.data?.locations ?? []).filter((l) => ["STORE", "WAREHOUSE", "COUNTER", "VAULT"].includes(l.type));
  const [destinationLocationId, setDestinationLocationId] = React.useState("");
  const [drafts, setDrafts] = React.useState<Record<string, { observedHuid: string; observedGrossWeight: string; weightDiscrepancyNote: string }>>(
    () => Object.fromEntries(ret.lines.map((l) => [l.itemId, { observedHuid: "", observedGrossWeight: String(l.grossWeight), weightDiscrepancyNote: "" }]))
  );
  const [err, setErr] = React.useState<string>();
  const receive = useReturnAction((v: Parameters<typeof returnsApi.receive>[1]) => returnsApi.receive(ret.id, v), "Return received", onDone);
  const go = () =>
    receive.mutate({
      destinationLocationId,
      lines: ret.lines.map((l) => {
        const d = drafts[l.itemId]!;
        return {
          itemId: l.itemId,
          ...(d.observedHuid.trim() ? { observedHuid: d.observedHuid.trim() } : {}),
          ...(d.observedGrossWeight.trim() ? { observedGrossWeight: Number(d.observedGrossWeight) } : {}),
          ...(d.weightDiscrepancyNote.trim() ? { weightDiscrepancyNote: d.weightDiscrepancyNote.trim() } : {}),
        };
      }),
    } as never, { onError: (e) => setErr(errorMessage(e)) });
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-primary bg-surface p-4" data-testid="receive-form">
      <h4 className="font-semibold">Receive {ret.returnNo} back</h4>
      <Field label="Received at">
        <select className={inputCls} value={destinationLocationId} onChange={(e) => setDestinationLocationId(e.target.value)} data-testid="receive-location">
          <option value="">Choose…</option>
          {stockLocations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
      </Field>
      {ret.lines.map((l) => {
        const d = drafts[l.itemId]!;
        const set = (patch: Partial<(typeof drafts)[string]>) => setDrafts((ds) => ({ ...ds, [l.itemId]: { ...ds[l.itemId]!, ...patch } }));
        return (
          <div key={l.itemId} className="grid grid-cols-2 gap-2 rounded-md border border-border-subtle p-3 sm:grid-cols-4" data-testid="receive-line">
            <p className="col-span-2 self-center font-medium sm:col-span-4">{l.itemCode} <span className="font-normal text-muted">· sold at {rupees(l.unitPrice)} · was {grams(l.grossWeight)}, HUID {l.huid ?? "none"}</span></p>
            <Field label="Observed HUID (if any)"><input className={inputCls} value={d.observedHuid} onChange={(e) => set({ observedHuid: e.target.value.toUpperCase() })} data-testid="receive-huid" /></Field>
            <Field label="Observed gross weight"><input type="number" step="0.001" className={inputCls} value={d.observedGrossWeight} onChange={(e) => set({ observedGrossWeight: e.target.value })} data-testid="receive-weight" /></Field>
            <Field label="Weight discrepancy note"><input className={inputCls} value={d.weightDiscrepancyNote} onChange={(e) => set({ weightDiscrepancyNote: e.target.value })} data-testid="receive-note" /></Field>
          </div>
        );
      })}
      {err && <p className="text-body-sm text-danger" role="alert" data-testid="receive-error">{err}</p>}
      <div className="flex gap-2">
        <button className={btn("primary")} disabled={!destinationLocationId || receive.isPending} onClick={go} data-testid="receive-go">Post receipt</button>
        <button className={btn()} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function InspectForm({ ret, onDone, onCancel }: { ret: Return; onDone: () => void; onCancel: () => void }) {
  const [drafts, setDrafts] = React.useState<Record<string, { condition: (typeof CONDITIONS)[number]; conditionNote: string }>>(
    () => Object.fromEntries(ret.lines.map((l) => [l.itemId, { condition: "GOOD", conditionNote: "" }]))
  );
  const [err, setErr] = React.useState<string>();
  const inspect = useReturnAction((lines: Parameters<typeof returnsApi.inspect>[1]) => returnsApi.inspect(ret.id, lines), "Return inspected", onDone);
  const go = () =>
    inspect.mutate(
      ret.lines.map((l) => ({ itemId: l.itemId, condition: drafts[l.itemId]!.condition, ...(drafts[l.itemId]!.conditionNote.trim() ? { conditionNote: drafts[l.itemId]!.conditionNote.trim() } : {}) })) as never,
      { onError: (e) => setErr(errorMessage(e)) }
    );
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-primary bg-surface p-4" data-testid="inspect-form">
      <h4 className="font-semibold">Inspect {ret.returnNo}</h4>
      {ret.lines.map((l) => {
        const d = drafts[l.itemId]!;
        const set = (patch: Partial<(typeof drafts)[string]>) => setDrafts((ds) => ({ ...ds, [l.itemId]: { ...ds[l.itemId]!, ...patch } }));
        return (
          <div key={l.itemId} className="grid grid-cols-2 gap-2 rounded-md border border-border-subtle p-3 sm:grid-cols-3" data-testid="inspect-line">
            <p className="col-span-2 self-center font-medium sm:col-span-1">{l.itemCode}</p>
            <Field label="Condition">
              <select className={inputCls} value={d.condition} onChange={(e) => set({ condition: e.target.value as (typeof CONDITIONS)[number] })} data-testid="inspect-condition">
                {CONDITIONS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Note"><input className={inputCls} value={d.conditionNote} onChange={(e) => set({ conditionNote: e.target.value })} data-testid="inspect-note" /></Field>
          </div>
        );
      })}
      {err && <p className="text-body-sm text-danger" role="alert" data-testid="inspect-error">{err}</p>}
      <div className="flex gap-2">
        <button className={btn("primary")} disabled={inspect.isPending} onClick={go} data-testid="inspect-go">Post inspection</button>
        <button className={btn()} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function SettleForm({ ret, onDone, onCancel }: { ret: Return; onDone: () => void; onCancel: () => void }) {
  const [method, setMethod] = React.useState<(typeof SETTLEMENT_METHODS)[number]>("REFUND");
  const [amount, setAmount] = React.useState(String(ret.refundableTotal / 100));
  const [reference, setReference] = React.useState("");
  const [err, setErr] = React.useState<string>();
  const settle = useReturnAction((v: Parameters<typeof returnsApi.settle>[1]) => returnsApi.settle(ret.id, v), "Return settled", onDone);
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-primary bg-surface p-4" data-testid="settle-form">
      <h4 className="font-semibold">Settle {ret.returnNo}</h4>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Method">
          <select className={inputCls} value={method} onChange={(e) => setMethod(e.target.value as (typeof SETTLEMENT_METHODS)[number])} data-testid="settle-method">
            {SETTLEMENT_METHODS.map((m) => <option key={m} value={m}>{m.replace(/_/g, " ")}</option>)}
          </select>
        </Field>
        <Field label="Amount (₹)"><input type="number" step="0.01" className={inputCls} value={amount} onChange={(e) => setAmount(e.target.value)} data-testid="settle-amount" /></Field>
        <Field label="Reference (optional)"><input className={inputCls} value={reference} onChange={(e) => setReference(e.target.value)} data-testid="settle-reference" /></Field>
      </div>
      {err && <p className="text-body-sm text-danger" role="alert" data-testid="settle-error">{err}</p>}
      <div className="flex gap-2">
        <button
          className={btn("primary")}
          disabled={settle.isPending || !amount}
          onClick={() => settle.mutate({ method, amount: Math.round(Number(amount) * 100), ...(reference.trim() ? { reference: reference.trim() } : {}) } as never, { onError: (e) => setErr(errorMessage(e)) })}
          data-testid="settle-go"
        >
          Record settlement
        </button>
        <button className={btn()} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function Detail({ ret, onDone }: { ret: Return; onDone: () => void }) {
  const { can } = useAuth();
  const [mode, setMode] = React.useState<"none" | "approve" | "reject" | "cancel" | "receive" | "inspect" | "settle">("none");
  const [text, setText] = React.useState("");
  const [err, setErr] = React.useState<string>();
  const done = () => { setMode("none"); setText(""); setErr(undefined); onDone(); };
  const fail = (e: unknown) => setErr(errorMessage(e));
  const approve = useReturnAction(() => returnsApi.approve(ret.id, text.trim() || undefined), "Approved", done);
  const reject = useReturnAction(() => returnsApi.reject(ret.id, text.trim()), "Rejected", done);
  const cancel = useReturnAction(() => returnsApi.cancel(ret.id, text.trim() || undefined), "Cancelled", done);
  const canApprove = can(P.RETURNS_APPROVE) && ret.status === "REQUESTED";
  const canReceive = can(P.RETURNS_CREATE) && ret.status === "APPROVED";
  const canInspect = can(P.RETURNS_CREATE) && ret.status === "RECEIVED";
  const canSettle = can(P.RETURNS_APPROVE) && ret.status === "INSPECTED";
  const canCancel = can(P.RETURNS_CREATE) && ret.canCancel;

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4" data-testid="return-detail">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-h4 font-semibold">{ret.returnNo} <span className="font-normal text-muted">· {ret.channel} · {ret.orderNo}</span></h3>
        <Status s={ret.status} />
      </div>
      <p className="text-body-sm text-muted">{ret.customer.name}{ret.customer.email && ` · ${ret.customer.email}`}{ret.customer.phone && ` · ${ret.customer.phone}`} — {ret.reason.replace(/_/g, " ").toLowerCase()}{ret.reasonNote && `: ${ret.reasonNote}`}</p>
      <p className="text-body-sm">Refundable total: <strong>{rupees(ret.refundableTotal)}</strong></p>
      {ret.rejectedReason && <p className="text-body-sm text-danger">Rejected: {ret.rejectedReason}</p>}
      {ret.settlement && <p className="text-body-sm text-success">Settled — {ret.settlement.method.replace(/_/g, " ").toLowerCase()} {rupees(ret.settlement.amount)}{ret.settlement.reference && ` (${ret.settlement.reference})`}</p>}
      <Table testId="return-lines"><thead><tr><Th>Item</Th><Th>Design</Th><Th right>Gross wt</Th><Th>HUID</Th><Th right>Sold for</Th><Th>Condition</Th></tr></thead><tbody>
        {ret.lines.map((l) => <LineRow key={l.itemId} line={l} />)}
      </tbody></Table>
      {err && <p className="text-body-sm text-danger" role="alert" data-testid="return-error">{err}</p>}
      <div className="flex flex-wrap gap-2">
        {canApprove && <button className={btn("primary")} onClick={() => setMode("approve")} data-testid="return-approve">Approve…</button>}
        {canApprove && <button className={btn("danger")} onClick={() => setMode("reject")} data-testid="return-reject">Reject…</button>}
        {canReceive && <button className={btn("primary")} onClick={() => setMode("receive")} data-testid="return-receive">Receive…</button>}
        {canInspect && <button className={btn("primary")} onClick={() => setMode("inspect")} data-testid="return-inspect">Inspect…</button>}
        {canSettle && <button className={btn("primary")} onClick={() => setMode("settle")} data-testid="return-settle">Settle…</button>}
        {canCancel && <button className={btn("danger")} onClick={() => setMode("cancel")} data-testid="return-cancel">Cancel…</button>}
      </div>
      {mode === "approve" && (
        <div className="flex flex-col gap-2 rounded-md border border-border-subtle p-3">
          <Field label="Note (optional)"><input className={inputCls} value={text} onChange={(e) => setText(e.target.value)} data-testid="approve-note" /></Field>
          <div className="flex gap-2"><button className={btn("primary")} disabled={approve.isPending} onClick={() => approve.mutate(undefined, { onError: fail })} data-testid="approve-go">Confirm approve</button><button className={btn()} onClick={() => setMode("none")}>Close</button></div>
        </div>
      )}
      {mode === "reject" && (
        <div className="flex flex-col gap-2 rounded-md border border-border-subtle p-3">
          <Field label="Reason"><input className={inputCls} value={text} onChange={(e) => setText(e.target.value)} data-testid="reject-reason" /></Field>
          <div className="flex gap-2"><button className={btn("danger")} disabled={reject.isPending || !text.trim()} onClick={() => reject.mutate(undefined, { onError: fail })} data-testid="reject-go">Confirm reject</button><button className={btn()} onClick={() => setMode("none")}>Close</button></div>
        </div>
      )}
      {mode === "cancel" && (
        <div className="flex flex-col gap-2 rounded-md border border-border-subtle p-3">
          <Field label="Reason (optional)"><input className={inputCls} value={text} onChange={(e) => setText(e.target.value)} data-testid="cancel-reason" /></Field>
          <div className="flex gap-2"><button className={btn("danger")} disabled={cancel.isPending} onClick={() => cancel.mutate(undefined, { onError: fail })} data-testid="cancel-go">Confirm cancel</button><button className={btn()} onClick={() => setMode("none")}>Close</button></div>
        </div>
      )}
      {mode === "receive" && <ReceiveForm ret={ret} onDone={done} onCancel={() => setMode("none")} />}
      {mode === "inspect" && <InspectForm ret={ret} onDone={done} onCancel={() => setMode("none")} />}
      {mode === "settle" && <SettleForm ret={ret} onDone={done} onCancel={() => setMode("none")} />}
      {ret.history.length > 0 && (
        <div className="flex flex-col gap-1 border-t border-border-subtle pt-3">
          <h4 className="text-caption font-semibold uppercase tracking-wide text-muted">History</h4>
          {ret.history.map((h, i) => <p key={i} className="text-caption text-muted">{day(h.at)} — {h.status.replace(/_/g, " ").toLowerCase()} by {h.byName ?? "system"}{h.note && ` — ${h.note}`}</p>)}
        </div>
      )}
    </div>
  );
}

export function ReturnsView() {
  const [tab, setTab] = React.useState<string>("");
  const [creating, setCreating] = React.useState(false);
  const [sel, setSel] = React.useState<string>();
  const dash = useReturnsDashboard();
  const q = useReturns(tab ? { status: tab } : {});
  const { can } = useAuth();
  const current = (q.data ?? []).find((r) => r.id === sel);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Returns" description="B2C and B2B returns — request, approve, receive, inspect and settle." />
      <Load q={dash} rows={3}>
        {dash.data && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Stat label="Requested" value={dash.data.counts.REQUESTED} tone={dash.data.counts.REQUESTED ? "warning" : undefined} />
            <Stat label="Approved" value={dash.data.counts.APPROVED} />
            <Stat label="Received" value={dash.data.counts.RECEIVED} tone={dash.data.counts.RECEIVED ? "warning" : undefined} />
            <Stat label="Inspected" value={dash.data.counts.INSPECTED} tone={dash.data.counts.INSPECTED ? "warning" : undefined} />
            <Stat label="Settled" value={dash.data.counts.SETTLED} />
            <Stat label="Rejected" value={dash.data.counts.REJECTED} />
          </div>
        )}
      </Load>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Filter">
          {TABS.map(([v, l]) => <button key={l} role="tab" aria-selected={tab === v} className={`h-8 rounded-full border px-3 text-caption ${tab === v ? "border-foreground bg-foreground text-background" : "border-border bg-surface"}`} onClick={() => setTab(v)} data-testid={`tab-${l.toLowerCase()}`}>{l}</button>)}
        </div>
        {can(P.RETURNS_CREATE) && <button className={btn("primary")} onClick={() => setCreating((v) => !v)} data-testid="return-new">{creating ? "Close" : "Request return"}</button>}
      </div>
      {creating && <NewReturnForm onDone={() => { setCreating(false); q.refetch(); dash.refetch(); }} />}
      <Load q={q}>
        {(q.data ?? []).length === 0 ? <p className="rounded-lg border border-dashed border-border p-10 text-center text-muted">Nothing here.</p> : (
          <Table testId="returns-table"><thead><tr><Th>Return</Th><Th>Channel</Th><Th>Order</Th><Th>Customer</Th><Th right>Pieces</Th><Th right>Refundable</Th><Th>Status</Th></tr></thead><tbody>
            {(q.data ?? []).map((r) => (
              <tr key={r.id} className={`cursor-pointer hover:bg-surface-sunken ${sel === r.id ? "bg-surface-sunken" : ""}`} onClick={() => setSel(r.id)} data-testid="return-row">
                <Td className="font-medium">{r.returnNo}</Td>
                <Td>{r.channel}</Td>
                <Td>{r.orderNo}</Td>
                <Td>{r.customer.name}</Td>
                <Td right>{r.lines.length}</Td>
                <Td right>{rupees(r.refundableTotal)}</Td>
                <Td><Status s={r.status} /></Td>
              </tr>
            ))}
          </tbody></Table>
        )}
      </Load>
      {current && <Detail key={current.id + current.status} ret={current} onDone={() => { q.refetch(); dash.refetch(); }} />}
    </div>
  );
}
