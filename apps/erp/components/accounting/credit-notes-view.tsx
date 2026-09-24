"use client";

import * as React from "react";
import { Receipt } from "lucide-react";
import { EmptyState, PageHeader } from "@jewellery/ui";
import { PERMISSIONS as P } from "@jewellery/types";
import type { CreditNote } from "@jewellery/types";
import { useAuth } from "../../lib/auth/auth-context";
import { accountingApi, useAccountingAction, useCreditNotes } from "../../lib/api/accounting";
import { errorMessage } from "../../lib/api/queries";
import { Field, Load, Status, Table, Td, Th, btn, day, inputCls, rupees } from "./shared";

const REASONS = ["SALES_RETURN", "PRICE_ADJUSTMENT", "GOODWILL", "OTHER"] as const;

function NewForm({ onDone }: { onDone: () => void }) {
  const [customerId, setCustomerId] = React.useState("");
  const [invoiceId, setInvoiceId] = React.useState("");
  const [reason, setReason] = React.useState<(typeof REASONS)[number]>("SALES_RETURN");
  const [taxableValue, setTaxableValue] = React.useState("");
  const [gst, setGst] = React.useState("0");
  const [reasonNote, setReasonNote] = React.useState("");
  const [err, setErr] = React.useState<string>();
  const create = useAccountingAction(accountingApi.createCreditNote, "Credit note issued", onDone);
  const canSubmit = customerId.trim().length === 24 && taxableValue;

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4" data-testid="new-credit-note-form">
      <h3 className="text-h4 font-semibold">New credit note</h3>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Customer id"><input className={inputCls} value={customerId} onChange={(e) => setCustomerId(e.target.value.trim())} placeholder="24-character customer id" data-testid="cn-customer" /></Field>
        <Field label="Invoice id (optional)"><input className={inputCls} value={invoiceId} onChange={(e) => setInvoiceId(e.target.value.trim())} data-testid="cn-invoice" /></Field>
        <Field label="Reason">
          <select className={inputCls} value={reason} onChange={(e) => setReason(e.target.value as (typeof REASONS)[number])} data-testid="cn-reason">
            {REASONS.map((r) => <option key={r} value={r}>{r.replace(/_/g, " ")}</option>)}
          </select>
        </Field>
        <Field label="Taxable value (₹)"><input type="number" step="0.01" className={inputCls} value={taxableValue} onChange={(e) => setTaxableValue(e.target.value)} data-testid="cn-taxable" /></Field>
        <Field label="GST (₹)"><input type="number" step="0.01" className={inputCls} value={gst} onChange={(e) => setGst(e.target.value)} data-testid="cn-gst" /></Field>
        <Field label="Note"><input className={inputCls} value={reasonNote} onChange={(e) => setReasonNote(e.target.value)} data-testid="cn-note" /></Field>
      </div>
      {err && <p className="text-body-sm text-danger" role="alert" data-testid="cn-form-error">{err}</p>}
      <div className="flex gap-2">
        <button
          className={btn("primary")}
          disabled={!canSubmit || create.isPending}
          onClick={() =>
            create.mutate(
              { customerId, ...(invoiceId ? { invoiceId } : {}), reason, taxableValue: Math.round(Number(taxableValue) * 100), gst: Math.round(Number(gst || 0) * 100), ...(reasonNote.trim() ? { reasonNote: reasonNote.trim() } : {}) } as never,
              { onError: (e) => setErr(errorMessage(e)) }
            )
          }
          data-testid="cn-save"
        >
          Issue credit note
        </button>
      </div>
      <p className="text-caption text-muted">Reduces Accounts Receivable for this customer by the total — the invoice id is for the paper trail, not required.</p>
    </div>
  );
}

function Row({ note, onDone }: { note: CreditNote; onDone: () => void }) {
  const { can } = useAuth();
  const [cancelling, setCancelling] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [err, setErr] = React.useState<string>();
  const cancel = useAccountingAction(() => accountingApi.cancelCreditNote(note.id, reason), "Credit note cancelled", () => { setCancelling(false); onDone(); });
  return (
    <>
      <tr data-testid="credit-note-row">
        <Td className="font-medium">{note.creditNoteNo}</Td>
        <Td>{note.customerName}</Td>
        <Td>{note.invoiceNo ?? "—"}</Td>
        <Td className="text-muted">{note.reason.replace(/_/g, " ")}</Td>
        <Td right>{rupees(note.total)}</Td>
        <Td>{day(note.issueDate)}</Td>
        <Td><Status s={note.status} /></Td>
        <Td>
          {can(P.ACCOUNTING_MANAGE) && note.status === "ISSUED" && !cancelling && <button className={btn("danger")} onClick={() => setCancelling(true)} data-testid="cn-cancel">Cancel…</button>}
        </Td>
      </tr>
      {cancelling && (
        <tr>
          <td colSpan={8} className="border-b border-border-subtle bg-surface-sunken px-3 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <input className={inputCls} placeholder="Reason" value={reason} onChange={(e) => setReason(e.target.value)} data-testid="cn-cancel-reason" />
              <button className={btn("danger")} disabled={!reason.trim() || cancel.isPending} onClick={() => cancel.mutate(undefined, { onError: (e) => setErr(errorMessage(e)) })} data-testid="cn-cancel-go">Confirm cancel</button>
              <button className={btn()} onClick={() => setCancelling(false)}>Close</button>
              {err && <span className="text-caption text-danger" role="alert">{err}</span>}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export function CreditNotesView() {
  const [creating, setCreating] = React.useState(false);
  const q = useCreditNotes();
  const { can } = useAuth();

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Credit Notes"
        description="Reduces what a customer owes — a sales return, a price correction, or goodwill. Always posts against Accounts Receivable."
        actions={can(P.ACCOUNTING_MANAGE) ? <button className={btn("primary")} onClick={() => setCreating((v) => !v)} data-testid="cn-new">{creating ? "Close" : "New credit note"}</button> : undefined}
      />
      {creating && <NewForm onDone={() => { setCreating(false); q.refetch(); }} />}
      <Load q={q}>
        {(q.data ?? []).length === 0 ? <EmptyState icon={<Receipt className="h-8 w-8" />} title="No credit notes yet" description="Issue one against a customer invoice for a sales return, a price correction, or goodwill." /> : (
          <Table testId="credit-notes-table"><thead><tr><Th>Note</Th><Th>Customer</Th><Th>Invoice</Th><Th>Reason</Th><Th right>Total</Th><Th>Date</Th><Th>Status</Th><Th></Th></tr></thead><tbody>
            {(q.data ?? []).map((n) => <Row key={n.id} note={n} onDone={() => q.refetch()} />)}
          </tbody></Table>
        )}
      </Load>
    </div>
  );
}
