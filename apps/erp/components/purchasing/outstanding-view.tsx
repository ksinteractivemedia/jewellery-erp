"use client";

import * as React from "react";
import { PERMISSIONS as P } from "@jewellery/types";
import type { SupplierInvoice, SupplierPayment } from "@jewellery/types";
import { useAuth } from "../../lib/auth/auth-context";
import { SUPPLIER_PAYMENT_METHODS } from "@jewellery/types";
import { purchasingApi, useSupplierInvoices, useSupplierPayments, usePurchasingAction, useSuppliers } from "../../lib/api/purchasing";
import { errorMessage } from "../../lib/api/queries";
import { Field, Load, Status, Table, Td, Th, btn, day, inputCls, money, rupeesToPaise } from "./shared";

function Allocator({ p, invoices, onDone }: { p: SupplierPayment; invoices: SupplierInvoice[]; onDone: () => void }) {
  const open = invoices.filter((i) => i.balance > 0);
  const [amounts, setAmounts] = React.useState<Record<string, string>>({});
  const [err, setErr] = React.useState<string>();
  const list = open.flatMap((i) => { const a = rupeesToPaise(amounts[i.id] ?? ""); return a ? [{ supplierInvoiceId: i.id, amount: a }] : []; });
  const sum = list.reduce((s, a) => s + a.amount, 0);
  const go = usePurchasingAction(() => purchasingApi.allocateSupplierPayment(p.id, list), "Payment applied", onDone);
  return (
    <div className="flex flex-col gap-2 rounded-md border border-border-subtle bg-surface p-3" data-testid="allocator">
      <p className="text-body-sm">Apply {p.paymentNo} — {money(p.unallocated)} available.</p>
      {open.length === 0 ? <p className="text-muted">No unpaid invoices from this supplier.</p> : open.map((i) => <div key={i.id} className="flex items-center justify-between gap-3 text-body-sm"><span>{i.supplierInvoiceNo} · due {day(i.dueDate)} · balance <strong className="tabular">{money(i.balance)}</strong></span><input className={`${inputCls} w-32 text-right`} inputMode="decimal" placeholder="₹" aria-label={`Amount for ${i.supplierInvoiceNo}`} value={amounts[i.id] ?? ""} onChange={(e) => setAmounts((a) => ({ ...a, [i.id]: e.target.value }))} data-testid={`alloc-${i.supplierInvoiceNo}`} /></div>)}
      {err && <p className="text-danger" role="alert">{err}</p>}
      <div><button className={btn("primary")} disabled={!list.length || sum > p.unallocated || go.isPending} onClick={() => go.mutate(undefined, { onError: (e) => setErr(errorMessage(e)) })} data-testid="alloc-go">Apply {money(sum)}</button></div>
    </div>
  );
}

function PaymentActions({ p, invoices, onDone }: { p: SupplierPayment; invoices: SupplierInvoice[]; onDone: () => void }) {
  const [open, setOpen] = React.useState<"" | "reverse" | "allocate">("");
  const [reason, setReason] = React.useState("");
  const [err, setErr] = React.useState<string>();
  const done = () => { setOpen(""); setErr(undefined); onDone(); };
  const reverse = usePurchasingAction(() => purchasingApi.reverseSupplierPayment(p.id, reason.trim()), "Payment reversed", done as () => void);
  if (p.status !== "RECORDED") return <span className="text-muted">—</span>;
  const onErr = { onError: (e: unknown) => setErr(errorMessage(e)) };
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {p.unallocated > 0 && <button className={btn("primary")} onClick={() => setOpen("allocate")} data-testid="pay-allocate">Apply to invoices</button>}
        <button className={btn("danger")} onClick={() => setOpen("reverse")}>Reverse</button>
      </div>
      {err && <p className="text-caption text-danger" role="alert">{err}</p>}
      {open === "reverse" && <div className="flex items-end gap-2"><input className={`${inputCls} w-64`} placeholder="Reason" value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Reason" /><button className={btn("danger")} disabled={!reason.trim()} onClick={() => reverse.mutate(undefined, onErr)}>Confirm reverse</button></div>}
      {open === "allocate" && <Allocator p={p} invoices={invoices} onDone={done} />}
    </div>
  );
}

function RecordPayment({ suppliers, onDone }: { suppliers: { id: string; name: string }[]; onDone: () => void }) {
  const [f, setF] = React.useState({ supplierId: "", method: "NEFT", amount: "", paidDate: new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10), reference: "", bankName: "" });
  const [err, setErr] = React.useState<string>();
  const amount = rupeesToPaise(f.amount);
  const save = usePurchasingAction(purchasingApi.recordSupplierPayment, "Payment recorded", () => { setF({ ...f, amount: "", reference: "" }); onDone(); });
  return (
    <div className="grid gap-3 rounded-lg border border-border bg-surface p-4 sm:grid-cols-3 lg:grid-cols-6" data-testid="record-payment">
      <Field label="Supplier"><select className={inputCls} value={f.supplierId} onChange={(e) => setF({ ...f, supplierId: e.target.value })} data-testid="rec-supplier"><option value="">Choose…</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
      <Field label="Method"><select className={inputCls} value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })} data-testid="rec-method">{SUPPLIER_PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m.replace("_", " ")}</option>)}</select></Field>
      <Field label="Amount (₹)"><input className={inputCls} inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} data-testid="rec-amount" /></Field>
      <Field label="Date paid"><input type="date" className={inputCls} value={f.paidDate} onChange={(e) => setF({ ...f, paidDate: e.target.value })} /></Field>
      <Field label="UTR / cheque no."><input className={inputCls} value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} data-testid="rec-ref" /></Field>
      <Field label="Bank"><input className={inputCls} value={f.bankName} onChange={(e) => setF({ ...f, bankName: e.target.value })} /></Field>
      <div className="flex items-end gap-3 sm:col-span-3 lg:col-span-6"><button className={btn("primary")} disabled={!f.supplierId || !amount || save.isPending} onClick={() => save.mutate({ ...f, amount, reference: f.reference.trim() || undefined, bankName: f.bankName.trim() || undefined } as never, { onError: (e) => setErr(errorMessage(e)) })} data-testid="rec-go">Record payment</button>{err && <span className="text-danger" role="alert">{err}</span>}</div>
    </div>
  );
}

export function OutstandingView() {
  const { can } = useAuth();
  const inv = useSupplierInvoices();
  const pay = useSupplierPayments();
  const suppliers = useSuppliers();
  const [tab, setTab] = React.useState<"invoices" | "payments">("invoices");
  const unpaid = (inv.data ?? []).filter((i) => i.balance > 0).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const refresh = () => { inv.refetch(); pay.refetch(); suppliers.refetch(); };
  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-1.5" role="tablist" aria-label="View">{([["invoices", `Unpaid invoices (${unpaid.length})`], ["payments", `Payments (${pay.data?.length ?? 0})`]] as const).map(([v, l]) => <button key={v} role="tab" aria-selected={tab === v} className={`h-8 rounded-full border px-3 text-caption ${tab === v ? "border-foreground bg-foreground text-background" : "border-border bg-surface"}`} onClick={() => setTab(v)} data-testid={`tab-${v}`}>{l}</button>)}</div>
      {tab === "invoices" && <Load q={inv}><Table testId="invoices-table"><thead><tr><Th>Invoice</Th><Th>Supplier</Th><Th>Due</Th><Th right>Total</Th><Th right>Paid</Th><Th right>Balance</Th><Th>Status</Th></tr></thead><tbody>{unpaid.map((i) => <tr key={i.id} data-testid="invoice-row"><Td className="font-medium">{i.supplierInvoiceNo}</Td><Td>{i.supplier.name}</Td><Td>{day(i.dueDate)}</Td><Td right>{money(i.totals.total)}</Td><Td right>{money(i.paid)}</Td><Td right className="font-semibold">{money(i.balance)}</Td><Td><Status s={i.status} /></Td></tr>)}</tbody></Table></Load>}
      {tab === "payments" && <>
        {can(P.ACCOUNTING_CREATE_PAYMENT) && suppliers.data && <RecordPayment suppliers={suppliers.data} onDone={refresh} />}
        <Load q={pay}><Table testId="payments-table"><thead><tr><Th>Payment</Th><Th>Supplier</Th><Th>Paid</Th><Th>Method</Th><Th>Reference</Th><Th right>Amount</Th><Th right>Applied</Th><Th>Status</Th><Th>Actions</Th></tr></thead><tbody>{(pay.data ?? []).map((p) => <tr key={p.id} className="align-top" data-testid="payment-row"><Td className="font-medium">{p.paymentNo}<span className="block text-caption font-normal text-muted">by {p.recordedByName ?? "staff"}</span></Td><Td>{p.supplier.name}</Td><Td>{day(p.paidDate)}</Td><Td>{p.method.replace("_", " ")}</Td><Td className="text-muted">{p.reference ?? "—"}</Td><Td right>{money(p.amount)}</Td><Td right>{money(p.amount - p.unallocated)}</Td><Td><Status s={p.status} /></Td><Td><PaymentActions p={p} invoices={inv.data ?? []} onDone={refresh} /></Td></tr>)}</tbody></Table></Load>
      </>}
    </div>
  );
}
