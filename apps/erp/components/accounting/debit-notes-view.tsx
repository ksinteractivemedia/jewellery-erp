"use client";

import * as React from "react";
import { FileMinus } from "lucide-react";
import { EmptyState, PageHeader } from "@jewellery/ui";
import { PERMISSIONS as P } from "@jewellery/types";
import type { DebitNote } from "@jewellery/types";
import { useAuth } from "../../lib/auth/auth-context";
import { accountingApi, useAccountingAction, useDebitNotes } from "../../lib/api/accounting";
import { errorMessage } from "../../lib/api/queries";
import { Field, Load, Status, Table, Td, Th, btn, day, inputCls, rupees } from "./shared";

const REASONS = ["PURCHASE_RETURN", "PRICE_ADJUSTMENT", "SHORT_SUPPLY", "OTHER"] as const;

function NewForm({ onDone }: { onDone: () => void }) {
  const [supplierId, setSupplierId] = React.useState("");
  const [supplierInvoiceId, setSupplierInvoiceId] = React.useState("");
  const [reason, setReason] = React.useState<(typeof REASONS)[number]>("PURCHASE_RETURN");
  const [taxableValue, setTaxableValue] = React.useState("");
  const [gst, setGst] = React.useState("0");
  const [reasonNote, setReasonNote] = React.useState("");
  const [err, setErr] = React.useState<string>();
  const create = useAccountingAction(accountingApi.createDebitNote, "Debit note issued", onDone);
  const canSubmit = supplierId.trim().length === 24 && taxableValue;

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4" data-testid="new-debit-note-form">
      <h3 className="text-h4 font-semibold">New debit note</h3>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Supplier id"><input className={inputCls} value={supplierId} onChange={(e) => setSupplierId(e.target.value.trim())} placeholder="24-character supplier id" data-testid="dn-supplier" /></Field>
        <Field label="Supplier invoice id (optional)"><input className={inputCls} value={supplierInvoiceId} onChange={(e) => setSupplierInvoiceId(e.target.value.trim())} data-testid="dn-invoice" /></Field>
        <Field label="Reason">
          <select className={inputCls} value={reason} onChange={(e) => setReason(e.target.value as (typeof REASONS)[number])} data-testid="dn-reason">
            {REASONS.map((r) => <option key={r} value={r}>{r.replace(/_/g, " ")}</option>)}
          </select>
        </Field>
        <Field label="Taxable value (₹)"><input type="number" step="0.01" className={inputCls} value={taxableValue} onChange={(e) => setTaxableValue(e.target.value)} data-testid="dn-taxable" /></Field>
        <Field label="GST (₹)"><input type="number" step="0.01" className={inputCls} value={gst} onChange={(e) => setGst(e.target.value)} data-testid="dn-gst" /></Field>
        <Field label="Note"><input className={inputCls} value={reasonNote} onChange={(e) => setReasonNote(e.target.value)} data-testid="dn-note" /></Field>
      </div>
      {err && <p className="text-body-sm text-danger" role="alert" data-testid="dn-form-error">{err}</p>}
      <div className="flex gap-2">
        <button
          className={btn("primary")}
          disabled={!canSubmit || create.isPending}
          onClick={() =>
            create.mutate(
              { supplierId, ...(supplierInvoiceId ? { supplierInvoiceId } : {}), reason, taxableValue: Math.round(Number(taxableValue) * 100), gst: Math.round(Number(gst || 0) * 100), ...(reasonNote.trim() ? { reasonNote: reasonNote.trim() } : {}) } as never,
              { onError: (e) => setErr(errorMessage(e)) }
            )
          }
          data-testid="dn-save"
        >
          Issue debit note
        </button>
      </div>
      <p className="text-caption text-muted">Reduces what the business owes this supplier — credits Inventory and the input tax claimed on the original bill.</p>
    </div>
  );
}

function Row({ note, onDone }: { note: DebitNote; onDone: () => void }) {
  const { can } = useAuth();
  const [cancelling, setCancelling] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [err, setErr] = React.useState<string>();
  const cancel = useAccountingAction(() => accountingApi.cancelDebitNote(note.id, reason), "Debit note cancelled", () => { setCancelling(false); onDone(); });
  return (
    <>
      <tr data-testid="debit-note-row">
        <Td className="font-medium">{note.debitNoteNo}</Td>
        <Td>{note.supplierName}</Td>
        <Td>{note.supplierInvoiceNo ?? "—"}</Td>
        <Td className="text-muted">{note.reason.replace(/_/g, " ")}</Td>
        <Td right>{rupees(note.total)}</Td>
        <Td>{day(note.issueDate)}</Td>
        <Td><Status s={note.status} /></Td>
        <Td>
          {can(P.ACCOUNTING_MANAGE) && note.status === "ISSUED" && !cancelling && <button className={btn("danger")} onClick={() => setCancelling(true)} data-testid="dn-cancel">Cancel…</button>}
        </Td>
      </tr>
      {cancelling && (
        <tr>
          <td colSpan={8} className="border-b border-border-subtle bg-surface-sunken px-3 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <input className={inputCls} placeholder="Reason" value={reason} onChange={(e) => setReason(e.target.value)} data-testid="dn-cancel-reason" />
              <button className={btn("danger")} disabled={!reason.trim() || cancel.isPending} onClick={() => cancel.mutate(undefined, { onError: (e) => setErr(errorMessage(e)) })} data-testid="dn-cancel-go">Confirm cancel</button>
              <button className={btn()} onClick={() => setCancelling(false)}>Close</button>
              {err && <span className="text-caption text-danger" role="alert">{err}</span>}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export function DebitNotesView() {
  const [creating, setCreating] = React.useState(false);
  const q = useDebitNotes();
  const { can } = useAuth();

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Debit Notes"
        description="Reduces what the business owes a supplier — a purchase return, a price correction, or a short-supply claim. Always posts against Accounts Payable."
        actions={can(P.ACCOUNTING_MANAGE) ? <button className={btn("primary")} onClick={() => setCreating((v) => !v)} data-testid="dn-new">{creating ? "Close" : "New debit note"}</button> : undefined}
      />
      {creating && <NewForm onDone={() => { setCreating(false); q.refetch(); }} />}
      <Load q={q}>
        {(q.data ?? []).length === 0 ? <EmptyState icon={<FileMinus className="h-8 w-8" />} title="No debit notes yet" description="Issue one against a supplier invoice for a purchase return, a price correction, or a short-supply claim." /> : (
          <Table testId="debit-notes-table"><thead><tr><Th>Note</Th><Th>Supplier</Th><Th>Invoice</Th><Th>Reason</Th><Th right>Total</Th><Th>Date</Th><Th>Status</Th><Th></Th></tr></thead><tbody>
            {(q.data ?? []).map((n) => <Row key={n.id} note={n} onDone={() => q.refetch()} />)}
          </tbody></Table>
        )}
      </Load>
    </div>
  );
}
