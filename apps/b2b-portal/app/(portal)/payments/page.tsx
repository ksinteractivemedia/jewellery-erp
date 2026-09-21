"use client";

import * as React from "react";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { B2B_PAYMENT_METHODS } from "@jewellery/types";
import { date, money, rupeesToPaise, today } from "../../../lib/money";
import { METHOD_LABEL, PAYMENT_LABEL } from "../../../lib/status";
import { key, reportPayment, usePayments } from "../../../lib/queries";
import { Amount, Empty, Failure, Loading, PageHead, StatusPill, TableWrap } from "../../../components/ui";

function Payments() {
  const sp = useSearchParams();
  const qc = useQueryClient();
  const q = usePayments();
  const [open, setOpen] = React.useState(sp.get("report") === "1");
  const [f, setF] = React.useState({ method: "NEFT", amount: "", receivedDate: today(), reference: "", bankName: "", notes: "" });
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string>();
  const [done, setDone] = React.useState<string>();
  const paise = rupeesToPaise(f.amount);
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paise) return setError("Enter the amount in rupees, e.g. 1,50,000 or 25000.50.");
    setBusy(true);
    setError(undefined);
    try {
      const { payment } = await reportPayment({ method: f.method, amount: paise, receivedDate: f.receivedDate, ...(f.reference.trim() ? { reference: f.reference.trim() } : {}), ...(f.bankName.trim() ? { bankName: f.bankName.trim() } : {}), ...(f.notes.trim() ? { notes: f.notes.trim() } : {}) });
      setDone(`${payment.paymentNo} recorded — ${money(payment.amount)}. We’ll confirm it once it shows in our bank account, then apply it to your invoices.`);
      setF({ method: "NEFT", amount: "", receivedDate: today(), reference: "", bankName: "", notes: "" });
      setOpen(false);
      await qc.invalidateQueries({ queryKey: key.all });
    } catch (err) { setError(err instanceof Error ? err.message : "We couldn’t record that."); }
    setBusy(false);
  };

  return (
    <>
      <PageHead title="Payments" sub="Payments you’ve made by bank transfer, cheque or cash. A payment counts against an invoice only after we verify and apply it." actions={<button className="btn btn-primary" onClick={() => setOpen((v) => !v)} data-testid="report-payment">Report a payment</button>} />
      {done && <p className="mb-4 rounded-md border border-success bg-success-subtle p-3 text-success" role="status" data-testid="payment-done">{done}</p>}
      {open && (
        <form onSubmit={submit} className="card mb-5 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="Report a payment" data-testid="payment-form">
          <p className="text-[0.8125rem] text-muted sm:col-span-2 lg:col-span-3">Tell us about a payment you’ve made. This is a note for our accounts team — <strong className="text-foreground">it does not mark any invoice paid</strong> until we’ve confirmed the money and applied it.</p>
          <div className="flex flex-col gap-1.5"><label className="label" htmlFor="method">Method</label><select id="method" className="field" value={f.method} onChange={(e) => set("method", e.target.value)} data-testid="pay-method">{B2B_PAYMENT_METHODS.map((m) => <option key={m} value={m}>{METHOD_LABEL[m]}</option>)}</select></div>
          <div className="flex flex-col gap-1.5"><label className="label" htmlFor="amount">Amount (₹)</label><input id="amount" className="field num" inputMode="decimal" required value={f.amount} onChange={(e) => set("amount", e.target.value)} aria-invalid={!!f.amount && !paise || undefined} data-testid="pay-amount" /></div>
          <div className="flex flex-col gap-1.5"><label className="label" htmlFor="rdate">Date paid</label><input id="rdate" type="date" max={today()} required className="field" value={f.receivedDate} onChange={(e) => set("receivedDate", e.target.value)} data-testid="pay-date" /></div>
          <div className="flex flex-col gap-1.5"><label className="label" htmlFor="ref">UTR / cheque no.</label><input id="ref" className="field" value={f.reference} onChange={(e) => set("reference", e.target.value)} maxLength={80} data-testid="pay-ref" /></div>
          <div className="flex flex-col gap-1.5"><label className="label" htmlFor="bank">Your bank</label><input id="bank" className="field" value={f.bankName} onChange={(e) => set("bankName", e.target.value)} maxLength={80} /></div>
          <div className="flex flex-col gap-1.5"><label className="label" htmlFor="pnotes">Notes</label><input id="pnotes" className="field" value={f.notes} onChange={(e) => set("notes", e.target.value)} maxLength={500} placeholder="Which invoices this is for" /></div>
          {error && <p className="text-[0.8125rem] text-danger sm:col-span-2 lg:col-span-3" role="alert" data-testid="pay-error">{error}</p>}
          <div className="flex gap-2 sm:col-span-2 lg:col-span-3"><button className="btn btn-primary" disabled={busy} data-testid="pay-submit">Send to accounts</button><button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>Cancel</button></div>
        </form>
      )}
      {q.isError ? <Failure error={q.error} retry={() => q.refetch()} /> : q.isLoading ? <Loading /> : (q.data ?? []).length === 0 ? <Empty title="No payments recorded" hint="Payments you report, and payments our accounts team records, appear here." /> : (
        <TableWrap><table className="tbl" data-testid="payment-table"><thead><tr><th>Payment</th><th>Date</th><th>Method</th><th>Reference</th><th className="text-right">Amount</th><th className="text-right">Applied</th><th className="text-right">Not yet applied</th><th>Status</th></tr></thead><tbody>
          {q.data!.map((p) => <tr key={p.id} data-testid="payment-row"><td className="font-medium">{p.paymentNo}<span className="block text-[0.6875rem] font-normal text-muted">{p.source === "CUSTOMER" ? "Reported by you" : "Recorded by us"}</span></td><td>{date(p.receivedDate)}</td><td>{METHOD_LABEL[p.method]}</td><td className="text-muted">{p.reference ?? "—"}</td><td className="text-right"><Amount v={p.amount} strong /></td><td className="text-right"><Amount v={p.allocated} /></td><td className="text-right"><Amount v={p.unallocated} /></td><td><StatusPill map={PAYMENT_LABEL} status={p.status} />{p.rejectedReason && <span className="mt-0.5 block text-[0.6875rem] text-danger">{p.rejectedReason}</span>}</td></tr>)}
        </tbody></table></TableWrap>
      )}
    </>
  );
}
export default function PaymentsPage() { return <Suspense fallback={<Loading />}><Payments /></Suspense>; }
