"use client";

import * as React from "react";
import type { HallmarkingBatch, HallmarkingLine } from "@jewellery/types";
import { PERMISSIONS as P } from "@jewellery/types";
import { useAuth } from "../../lib/auth/auth-context";
import { hallmarkingApi, useAssayingCentres, useHallmarkingAction, useHallmarkingBatches } from "../../lib/api/hallmarking";
import { errorMessage } from "../../lib/api/queries";
import { Field, HuidTag, Load, Status, Table, Td, Th, btn, day, grams, inputCls } from "./shared";
import { ItemPicker } from "./item-picker";

const TABS = [["", "All"], ["PENDING", "Pending"], ["TRANSIT", "In Transit"], ["RECEIVED", "Received"], ["VERIFIED", "Verified"], ["FAILED", "Failed"]] as const;

function NewBatchForm({ onDone }: { onDone: () => void }) {
  const centres = useAssayingCentres();
  const [assayingCentreId, setAssayingCentreId] = React.useState("");
  const [expectedReturnDate, setExpectedReturnDate] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [itemIds, setItemIds] = React.useState<string[]>([]);
  const [err, setErr] = React.useState<string>();
  const create = useHallmarkingAction(hallmarkingApi.createBatch, "Sent for hallmarking", onDone);
  const activeCentres = (centres.data ?? []).filter((c) => c.isActive);
  const canSubmit = assayingCentreId && itemIds.length > 0;

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4" data-testid="new-batch-form">
      <h3 className="text-h4 font-semibold">Send to hallmarking</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Assaying centre">
          <select className={inputCls} value={assayingCentreId} onChange={(e) => setAssayingCentreId(e.target.value)} data-testid="batch-centre">
            <option value="">Choose…</option>
            {activeCentres.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Expected return (optional)"><input type="date" className={inputCls} value={expectedReturnDate} onChange={(e) => setExpectedReturnDate(e.target.value)} data-testid="batch-return-date" /></Field>
      </div>
      <ItemPicker selected={itemIds} onChange={setItemIds} />
      <Field label="Notes"><textarea className={`${inputCls} h-auto py-2`} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      {err && <p className="text-body-sm text-danger" role="alert" data-testid="batch-form-error">{err}</p>}
      <div className="flex gap-2">
        <button
          className={btn("primary")}
          disabled={!canSubmit || create.isPending}
          onClick={() => create.mutate({ assayingCentreId, itemIds, ...(expectedReturnDate ? { expectedReturnDate } : {}), ...(notes.trim() ? { notes: notes.trim() } : {}) } as never, { onError: (e) => setErr(errorMessage(e)) })}
          data-testid="batch-save"
        >
          Send {itemIds.length > 0 ? `${itemIds.length} item${itemIds.length > 1 ? "s" : ""}` : ""}
        </button>
      </div>
    </div>
  );
}

/** One piece's outcome, decided right from the batch's own detail panel — mirrors manufacturing's QC row. */
function LineRow({ batch, line, onDone }: { batch: HallmarkingBatch; line: HallmarkingLine; onDone: () => void }) {
  const { can } = useAuth();
  const [notes, setNotes] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [err, setErr] = React.useState<string>();
  const verify = useHallmarkingAction(() => hallmarkingApi.verify(batch.id, line.itemId, notes || undefined), "Marked verified", onDone);
  const fail = useHallmarkingAction(() => hallmarkingApi.fail(batch.id, line.itemId, reason), "Marked failed", onDone);
  const decide = batch.status === "RECEIVED" && !line.outcome && can(P.INVENTORY_CREATE);
  return (
    <tr data-testid="hallmarking-line-row">
      <Td className="font-medium tabular">{line.itemCode}</Td>
      <Td>{line.purity}</Td>
      <Td right>{grams(line.grossWeight)}</Td>
      <Td><HuidTag huid={line.huid} /></Td>
      <Td className="text-muted">{line.certificateNumber ?? "—"}{line.hallmarkDate && ` · ${day(line.hallmarkDate)}`}</Td>
      <Td><Status s={line.effectiveStatus} />{line.failureReason && <span className="block text-caption text-danger">{line.failureReason}</span>}</Td>
      <Td>
        {decide ? (
          <span className="flex flex-col gap-1.5">
            <span className="flex flex-wrap items-center gap-2">
              <input className={`${inputCls} w-40`} placeholder="Notes (verify)" value={notes} onChange={(e) => setNotes(e.target.value)} data-testid={`line-verify-notes-${line.itemCode}`} />
              <button className={btn("primary")} disabled={verify.isPending} onClick={() => verify.mutate(undefined, { onError: (e) => setErr(errorMessage(e)) })} data-testid={`line-verify-${line.itemCode}`}>Verify</button>
            </span>
            <span className="flex flex-wrap items-center gap-2">
              <input className={`${inputCls} w-40`} placeholder="Failure reason" value={reason} onChange={(e) => setReason(e.target.value)} data-testid={`line-fail-reason-${line.itemCode}`} />
              <button className={btn("danger")} disabled={fail.isPending || !reason.trim()} onClick={() => fail.mutate(undefined, { onError: (e) => setErr(errorMessage(e)) })} data-testid={`line-fail-${line.itemCode}`}>Fail</button>
            </span>
            {err && <span className="text-caption text-danger" role="alert">{err}</span>}
          </span>
        ) : <span className="text-muted">—</span>}
      </Td>
    </tr>
  );
}

function ReceiveForm({ batch, onDone, onCancel }: { batch: HallmarkingBatch; onDone: () => void; onCancel: () => void }) {
  const [drafts, setDrafts] = React.useState<Record<string, { huid: string; certificateNumber: string; hallmarkDate: string }>>(
    () => Object.fromEntries(batch.lines.map((l) => [l.itemId, { huid: "", certificateNumber: "", hallmarkDate: "" }]))
  );
  const [err, setErr] = React.useState<string>();
  const receive = useHallmarkingAction(
    (lines: { itemId: string; huid?: string; certificateNumber?: string; hallmarkDate?: string }[]) => hallmarkingApi.receive(batch.id, lines),
    "Batch received back",
    onDone
  );
  const go = () =>
    receive.mutate(
      batch.lines.map((l) => {
        const d = drafts[l.itemId]!;
        return { itemId: l.itemId, ...(d.huid.trim() ? { huid: d.huid.trim() } : {}), ...(d.certificateNumber.trim() ? { certificateNumber: d.certificateNumber.trim() } : {}), ...(d.hallmarkDate ? { hallmarkDate: d.hallmarkDate } : {}) };
      }),
      { onError: (e) => setErr(errorMessage(e)) }
    );
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-primary bg-surface p-4" data-testid="receive-form">
      <h4 className="font-semibold">Receive {batch.hallmarkingNo} back from {batch.assayingCentre.name}</h4>
      <p className="text-caption text-muted">Every piece on the batch must be accounted for together. Leave the HUID blank for a piece that came back unmarked or rejected.</p>
      {batch.lines.map((l) => {
        const d = drafts[l.itemId]!;
        const set = (patch: Partial<(typeof drafts)[string]>) => setDrafts((ds) => ({ ...ds, [l.itemId]: { ...ds[l.itemId]!, ...patch } }));
        return (
          <div key={l.itemId} className="grid grid-cols-2 gap-2 rounded-md border border-border-subtle p-3 sm:grid-cols-4" data-testid="receive-line">
            <p className="col-span-2 self-center font-medium sm:col-span-4">{l.itemCode} <span className="font-normal text-muted">· {l.purity} · {grams(l.grossWeight)}</span></p>
            <Field label="HUID"><input className={inputCls} value={d.huid} onChange={(e) => set({ huid: e.target.value.toUpperCase() })} placeholder="6 chars" data-testid="receive-huid" /></Field>
            <Field label="Certificate #"><input className={inputCls} value={d.certificateNumber} onChange={(e) => set({ certificateNumber: e.target.value })} data-testid="receive-certificate" /></Field>
            <Field label="Hallmark date"><input type="date" className={inputCls} value={d.hallmarkDate} onChange={(e) => set({ hallmarkDate: e.target.value })} data-testid="receive-date" /></Field>
          </div>
        );
      })}
      {err && <p className="text-body-sm text-danger" role="alert" data-testid="receive-error">{err}</p>}
      <div className="flex gap-2">
        <button className={btn("primary")} disabled={receive.isPending} onClick={go} data-testid="receive-go">Post receipt</button>
        <button className={btn()} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function Detail({ batch, onDone }: { batch: HallmarkingBatch; onDone: () => void }) {
  const { can } = useAuth();
  const [mode, setMode] = React.useState<"none" | "cancel" | "receive" | "arrive">("none");
  const [reason, setReason] = React.useState("");
  const [err, setErr] = React.useState<string>();
  const done = () => { setMode("none"); setErr(undefined); onDone(); };
  const fail = (e: unknown) => setErr(errorMessage(e));
  const dispatch = useHallmarkingAction(() => hallmarkingApi.dispatch(batch.id), "Dispatched", done);
  const arrive = useHallmarkingAction(() => hallmarkingApi.arrive(batch.id, reason.trim() || undefined), "Marked arrived", done);
  const cancel = useHallmarkingAction(() => hallmarkingApi.cancel(batch.id, reason.trim() || undefined), "Cancelled", done);
  const write = can(P.INVENTORY_CREATE);
  const canDispatch = write && batch.status === "PENDING";
  const canArrive = write && batch.status === "IN_TRANSIT";
  const canReceive = write && (batch.status === "IN_TRANSIT" || batch.status === "AT_CENTRE");
  const canCancel = write && batch.status === "PENDING";
  const totalWeight = batch.lines.reduce((s, l) => s + l.grossWeight, 0);

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4" data-testid="batch-detail">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-h4 font-semibold">{batch.hallmarkingNo} <span className="font-normal text-muted">· {batch.assayingCentre.name}</span></h3>
        <Status s={batch.status} />
      </div>
      <p className="text-body-sm text-muted">{batch.lines.length} piece{batch.lines.length > 1 ? "s" : ""} · {grams(totalWeight)} total{batch.sentDate && ` · sent ${day(batch.sentDate)}`}{batch.expectedReturnDate && ` · expected back ${day(batch.expectedReturnDate)}`}</p>
      {batch.notes && <p className="text-body-sm">Notes: {batch.notes}</p>}
      <Table testId="batch-lines"><thead><tr><Th>Item</Th><Th>Purity</Th><Th right>Gross wt</Th><Th>HUID</Th><Th>Certificate</Th><Th>Status</Th><Th>Decision</Th></tr></thead><tbody>
        {batch.lines.map((l) => <LineRow key={l.itemId} batch={batch} line={l} onDone={onDone} />)}
      </tbody></Table>
      {err && <p className="text-body-sm text-danger" role="alert" data-testid="batch-error">{err}</p>}
      <div className="flex flex-wrap gap-2">
        {canDispatch && <button className={btn("primary")} disabled={dispatch.isPending} onClick={() => dispatch.mutate(undefined, { onError: fail })} data-testid="batch-dispatch">Dispatch</button>}
        {canArrive && <button className={btn()} onClick={() => setMode("arrive")} data-testid="batch-arrive">Mark arrived…</button>}
        {canReceive && <button className={btn("primary")} onClick={() => setMode("receive")} data-testid="batch-receive">Receive…</button>}
        {canCancel && <button className={btn("danger")} onClick={() => setMode("cancel")} data-testid="batch-cancel">Cancel…</button>}
      </div>
      {mode === "arrive" && (
        <div className="flex flex-col gap-2 rounded-md border border-border-subtle p-3">
          <Field label="Notes (optional)"><input className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} data-testid="batch-arrive-notes" /></Field>
          <div className="flex gap-2"><button className={btn("primary")} disabled={arrive.isPending} onClick={() => arrive.mutate(undefined, { onError: fail })} data-testid="batch-arrive-go">Confirm arrived</button><button className={btn()} onClick={() => setMode("none")}>Close</button></div>
        </div>
      )}
      {mode === "cancel" && (
        <div className="flex flex-col gap-2 rounded-md border border-border-subtle p-3">
          <Field label="Reason"><input className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} data-testid="batch-cancel-reason" /></Field>
          <div className="flex gap-2"><button className={btn("danger")} disabled={cancel.isPending} onClick={() => cancel.mutate(undefined, { onError: fail })} data-testid="batch-cancel-go">Cancel batch</button><button className={btn()} onClick={() => setMode("none")}>Close</button></div>
        </div>
      )}
      {mode === "receive" && <ReceiveForm batch={batch} onDone={done} onCancel={() => setMode("none")} />}
      {batch.history.length > 0 && (
        <div className="flex flex-col gap-1 border-t border-border-subtle pt-3">
          <h4 className="text-caption font-semibold uppercase tracking-wide text-muted">History</h4>
          {batch.history.map((h, i) => <p key={i} className="text-caption text-muted">{day(h.at.slice(0, 10))} — {h.status.replace(/_/g, " ").toLowerCase()} by {h.byName ?? "system"}{h.note && ` — ${h.note}`}</p>)}
        </div>
      )}
    </div>
  );
}

/** Matches the effective-status tab a row belongs on — a batch's own stage until a piece has its own outcome. */
function tabMatches(tab: string, batch: HallmarkingBatch): boolean {
  if (!tab) return true;
  if (tab === "TRANSIT") return batch.status === "IN_TRANSIT" || batch.status === "AT_CENTRE";
  if (tab === "PENDING") return batch.status === "PENDING";
  // RECEIVED / VERIFIED / FAILED are per-piece: the batch shows up if any of its lines is currently on that tab.
  return batch.lines.some((l) => l.effectiveStatus === tab);
}

export function HallmarkingBatchesView() {
  const [tab, setTab] = React.useState<string>("");
  const [creating, setCreating] = React.useState(false);
  const [sel, setSel] = React.useState<string>();
  const q = useHallmarkingBatches();
  const { can } = useAuth();
  const batches = (q.data ?? []).filter((b) => b.status !== "CANCELLED" || tab === "");
  const rows = batches.filter((b) => tabMatches(tab, b));
  const current = (q.data ?? []).find((b) => b.id === sel);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Filter">
          {TABS.map(([v, l]) => <button key={l} role="tab" aria-selected={tab === v} className={`h-8 rounded-full border px-3 text-caption ${tab === v ? "border-foreground bg-foreground text-background" : "border-border bg-surface"}`} onClick={() => setTab(v)} data-testid={`tab-${l.toLowerCase().replace(/\s+/g, "-")}`}>{l}</button>)}
        </div>
        {can(P.INVENTORY_CREATE) && <button className={btn("primary")} onClick={() => setCreating((v) => !v)} data-testid="batch-new">{creating ? "Close" : "Send to hallmarking"}</button>}
      </div>
      {creating && <NewBatchForm onDone={() => { setCreating(false); q.refetch(); }} />}
      <Load q={q}>
        {rows.length === 0 ? <p className="rounded-lg border border-dashed border-border p-10 text-center text-muted">Nothing here.</p> : (
          <Table testId="batches-table"><thead><tr><Th>Batch</Th><Th>Centre</Th><Th right>Pieces</Th><Th right>Gross wt</Th><Th>Sent</Th><Th>Status</Th></tr></thead><tbody>
            {rows.map((b) => (
              <tr key={b.id} className={`cursor-pointer hover:bg-surface-sunken ${sel === b.id ? "bg-surface-sunken" : ""}`} onClick={() => setSel(b.id)} data-testid="batch-row">
                <Td className="font-medium">{b.hallmarkingNo}</Td>
                <Td>{b.assayingCentre.name}</Td>
                <Td right>{b.lines.length}</Td>
                <Td right>{grams(b.lines.reduce((s, l) => s + l.grossWeight, 0))}</Td>
                <Td>{b.sentDate ? day(b.sentDate) : "—"}</Td>
                <Td><Status s={b.status} /></Td>
              </tr>
            ))}
          </tbody></Table>
        )}
      </Load>
      {current && <Detail key={current.id + current.status} batch={current} onDone={() => q.refetch()} />}
    </div>
  );
}
