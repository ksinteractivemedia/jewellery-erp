"use client";

import * as React from "react";
import type { B2BCustomerRow } from "../../lib/api/b2b";
import type { B2BInvoice, B2BPayment, B2BSalesOrder } from "@jewellery/types";
import { B2B_PAYMENT_METHODS, PERMISSIONS as P } from "@jewellery/types";
import { useAuth } from "../../lib/auth/auth-context";
import { b2bApi, useB2BAction, useB2BCustomers, useB2BInvoices, useB2BOrders, useB2BPayments, useB2BQuotations } from "../../lib/api/b2b";
import { errorMessage } from "../../lib/api/queries";
import { CreditLine, CreditVerdict, Field, Load, Status, Table, Td, Th, btn, day, inputCls, money, money0, rupeesToPaise } from "./shared";

// ---- customers ---------------------------------------------------------------------------------------
function TermsEditor({ c, onDone }: { c: B2BCustomerRow; onDone: () => void }) {
  const [f, setF] = React.useState({ creditLimit: String(c.position.limit / 100), terms: String(c.paymentTermsDays), hold: c.position.onHold, overdue: c.position.blockOnOverdue, list: c.priceListCode ?? "", territory: c.territory ?? "" });
  const save = useB2BAction(() => b2bApi.updateProfile(c.id, { creditLimit: rupeesToPaise(f.creditLimit), paymentTermsDays: Number(f.terms), creditHold: f.hold, blockOnOverdue: f.overdue, priceListCode: f.list.trim() || null, territory: f.territory.trim() || null }), "Terms updated", onDone);
  const bad = rupeesToPaise(f.creditLimit) === undefined || !Number.isInteger(Number(f.terms));
  return (
    <div className="grid gap-3 rounded-lg border border-border bg-surface p-4 sm:grid-cols-3" data-testid="terms-editor">
      <h3 className="text-h4 font-semibold sm:col-span-3">{c.name} — trading terms</h3>
      <Field label="Credit limit (₹)"><input className={inputCls} inputMode="decimal" value={f.creditLimit} onChange={(e) => setF({ ...f, creditLimit: e.target.value })} data-testid="edit-limit" /></Field>
      <Field label="Payment terms (days)"><input className={inputCls} inputMode="numeric" value={f.terms} onChange={(e) => setF({ ...f, terms: e.target.value })} /></Field>
      <Field label="Price list code"><input className={inputCls} value={f.list} onChange={(e) => setF({ ...f, list: e.target.value.toUpperCase() })} /></Field>
      <Field label="Territory"><input className={inputCls} value={f.territory} onChange={(e) => setF({ ...f, territory: e.target.value })} /></Field>
      <label className="flex items-center gap-2 text-body-sm"><input type="checkbox" checked={f.hold} onChange={(e) => setF({ ...f, hold: e.target.checked })} data-testid="edit-hold" />Credit hold (every new order needs an override)</label>
      <label className="flex items-center gap-2 text-body-sm"><input type="checkbox" checked={f.overdue} onChange={(e) => setF({ ...f, overdue: e.target.checked })} />Block on overdue invoices</label>
      <div className="sm:col-span-3"><button className={btn("primary")} disabled={bad || save.isPending} onClick={() => save.mutate(undefined)} data-testid="save-terms">Save terms</button><span className="ml-3 text-caption text-muted">Every change is recorded in the audit log with the before and after.</span></div>
    </div>
  );
}
export function CustomersView() {
  const { can } = useAuth();
  const q = useB2BCustomers();
  const [sel, setSel] = React.useState<string>();
  const c = q.data?.find((x) => x.id === sel);
  return (
    <div className="flex flex-col gap-4">
      <Load q={q}>
        <Table testId="b2b-customers"><thead><tr><Th>Customer</Th><Th>GSTIN</Th><Th>Territory</Th><Th>Salesperson</Th><Th>Terms</Th><Th right>Limit</Th><Th right>Outstanding</Th><Th right>Available</Th><Th right>Overdue</Th></tr></thead><tbody>
          {(q.data ?? []).map((r) => <tr key={r.id} className={`cursor-pointer hover:bg-surface-sunken ${sel === r.id ? "bg-surface-sunken" : ""}`} onClick={() => setSel(r.id)} data-testid="b2b-customer-row"><Td className="font-medium">{r.name}{r.position.onHold && <span className="ml-2 text-caption text-danger">on hold</span>}</Td><Td className="text-muted">{r.gstin ?? "—"}</Td><Td>{r.territory ?? "—"}</Td><Td>{r.salesperson ?? "—"}</Td><Td>Net {r.paymentTermsDays}{r.priceListCode && ` · ${r.priceListCode}`}</Td><Td right>{money0(r.position.limit)}</Td><Td right>{money0(r.position.outstanding)}</Td><Td right className={r.position.available < 0 ? "text-danger" : undefined}>{money0(r.position.available)}</Td><Td right className={r.position.overdue ? "text-danger" : undefined}>{money0(r.position.overdue)}</Td></tr>)}
        </tbody></Table>
      </Load>
      {c && (can(P.CUSTOMERS_MANAGE) ? <TermsEditor key={c.id + c.position.limit + String(c.position.onHold)} c={c} onDone={() => q.refetch()} /> : <div className="rounded-lg border border-border bg-surface p-4"><h3 className="mb-2 font-semibold">{c.name}</h3><CreditLine p={c.position} /><p className="mt-2 text-caption text-muted">You can view this account but not change its terms.</p></div>)}
    </div>
  );
}

// ---- quotations --------------------------------------------------------------------------------------
export function QuotationsView() {
  const q = useB2BQuotations();
  return (
    <Load q={q}>
      <Table testId="b2b-quotes"><thead><tr><Th>Quotation</Th><Th>Customer</Th><Th>PO</Th><Th right>Version</Th><Th>Valid until</Th><Th right>Total</Th><Th>Status</Th><Th>Latest message</Th></tr></thead><tbody>
        {(q.data ?? []).map((x) => <tr key={x.id} data-testid="b2b-quote-row"><Td className="font-medium">{x.quoteNo}</Td><Td>{x.customer.name}</Td><Td>{x.poNo}</Td><Td right>v{x.version}</Td><Td>{day(x.validUntil)}</Td><Td right>{money(x.totals.total)}</Td><Td><Status s={x.status} /></Td><Td className="max-w-xs truncate text-muted">{x.messages.at(-1) ? `${x.messages.at(-1)!.by === "CUSTOMER" ? "Customer: " : "You: "}${x.messages.at(-1)!.text}` : "—"}</Td></tr>)}
      </tbody></Table>
    </Load>
  );
}

// ---- orders & credit ---------------------------------------------------------------------------------
function OrderRow({ o, onDone }: { o: B2BSalesOrder; onDone: () => void }) {
  const { can } = useAuth();
  const [reason, setReason] = React.useState("");
  const [open, setOpen] = React.useState<"" | "credit" | "cancel">("");
  const [err, setErr] = React.useState<string>();
  const done = () => { setOpen(""); setErr(undefined); onDone(); };
  const fail = (e: unknown) => setErr(errorMessage(e));
  const credit = useB2BAction(() => b2bApi.approveCredit(o.id, reason.trim()), "Order approved", done);
  const allocate = useB2BAction(() => b2bApi.allocate(o.id), "Stock allocated", done);
  const invoice = useB2BAction(() => b2bApi.invoice(o.id), "Invoice issued", done);
  const cancel = useB2BAction(() => b2bApi.cancelOrder(o.id, reason.trim()), "Order cancelled", done);
  const run = (m: { mutate: (v: undefined, o?: { onError?: (e: unknown) => void }) => void }) => m.mutate(undefined, { onError: fail });
  const approver = can(P.B2B_APPROVE_PO);
  return (
    <>
      <tr data-testid="b2b-order-row"><Td className="font-medium">{o.soNo}</Td><Td>{o.customer.name}</Td><Td className="text-muted">{o.customerPoRef ?? o.poNo}</Td><Td right>{money(o.totals.total)}</Td><Td><Status s={o.status} />{o.credit.override && <span className="ml-2 text-caption text-muted" title={o.credit.override.reason}>override</span>}</Td>
        <Td>
          {approver && o.status === "PENDING_CREDIT_APPROVAL" && <button className={btn("primary")} onClick={() => setOpen("credit")} data-testid="order-approve-credit">Approve credit…</button>}
          {approver && o.status === "APPROVED" && <button className={btn("primary")} onClick={() => run(allocate)} data-testid="order-allocate">Allocate stock</button>}
          {approver && o.status === "ALLOCATED" && <button className={btn("primary")} onClick={() => run(invoice)} data-testid="order-invoice">Issue invoice</button>}
          {approver && ["PENDING_CREDIT_APPROVAL", "APPROVED", "ALLOCATED"].includes(o.status) && <button className={`${btn("danger")} ml-2`} onClick={() => setOpen("cancel")} data-testid="order-cancel">Cancel</button>}
        </Td></tr>
      {(open || err || o.shortfall?.length) && (
        <tr><td colSpan={6} className="border-b border-border-subtle bg-surface-sunken px-3 py-3">
          {o.status === "PENDING_CREDIT_APPROVAL" && <div className="mb-2"><CreditVerdict check={{ ...o.credit.check, requiresApproval: true }} /></div>}
          {!!o.shortfall?.length && <p className="mb-2 text-body-sm text-warning" data-testid="shortfall">Short of stock: {o.shortfall.map((s) => `${s.sku} (need ${s.wanted}, have ${s.available})`).join("; ")}</p>}
          {err && <p className="mb-2 text-body-sm text-danger" role="alert" data-testid="order-error">{err}</p>}
          {open && <div className="flex flex-wrap items-end gap-2"><Field label={open === "credit" ? "Reason (min 10 characters). If the account is still over terms this needs the credit-override permission." : "Reason"}><input className={`${inputCls} w-[28rem] max-w-full`} value={reason} onChange={(e) => setReason(e.target.value)} data-testid="order-reason" /></Field><button className={btn(open === "cancel" ? "danger" : "primary")} disabled={open === "credit" ? reason.trim().length < 10 : !reason.trim()} onClick={() => run(open === "credit" ? credit : cancel)} data-testid="order-go">{open === "credit" ? "Approve" : "Cancel order"}</button><button className={btn()} onClick={() => { setOpen(""); setErr(undefined); }}>Close</button></div>}
        </td></tr>
      )}
    </>
  );
}
export function CreditOrdersView() {
  const q = useB2BOrders();
  const [g, setG] = React.useState("PENDING_CREDIT_APPROVAL");
  const items = (q.data ?? []).filter((o) => !g || g.split(",").includes(o.status));
  const held = (q.data ?? []).filter((o) => o.status === "PENDING_CREDIT_APPROVAL").length;
  const tabs: [string, string][] = [["PENDING_CREDIT_APPROVAL", `Held for credit (${held})`], ["APPROVED,ALLOCATED", "To allocate / invoice"], ["INVOICED", "Invoiced"], ["", "All"]];
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Filter">{tabs.map(([v, l]) => <button key={l} role="tab" aria-selected={g === v} className={`h-8 rounded-full border px-3 text-caption ${g === v ? "border-foreground bg-foreground text-background" : "border-border bg-surface"}`} onClick={() => setG(v)} data-testid={`tab-${v || "all"}`}>{l}</button>)}</div>
      <Load q={q}>{items.length === 0 ? <p className="rounded-lg border border-dashed border-border p-10 text-center text-muted">Nothing here.</p> : (
        <Table testId="b2b-orders"><thead><tr><Th>Order</Th><Th>Customer</Th><Th>PO / ref</Th><Th right>Total</Th><Th>Status</Th><Th>Actions</Th></tr></thead><tbody>{items.map((o) => <OrderRow key={o.id + o.status} o={o} onDone={() => q.refetch()} />)}</tbody></Table>
      )}</Load>
    </div>
  );
}

// ---- invoices & payments -------------------------------------------------------------------------------
function Allocator({ p, invoices, onDone }: { p: B2BPayment; invoices: B2BInvoice[]; onDone: () => void }) {
  const open = invoices.filter((i) => i.customer.id === p.customer.id && i.balance > 0);
  const [amounts, setAmounts] = React.useState<Record<string, string>>({});
  const [err, setErr] = React.useState<string>();
  const list = open.flatMap((i) => { const a = rupeesToPaise(amounts[i.id] ?? ""); return a ? [{ invoiceId: i.id, amount: a }] : []; });
  const sum = list.reduce((s, a) => s + a.amount, 0);
  const go = useB2BAction(() => b2bApi.allocatePayment(p.id, list), "Payment applied", onDone);
  return (
    <div className="flex flex-col gap-2 rounded-md border border-border-subtle bg-surface p-3" data-testid="allocator">
      <p className="text-body-sm">Apply {p.paymentNo} — {money(p.unallocated)} available. An invoice is paid only by what you apply here.</p>
      {open.length === 0 ? <p className="text-muted">This customer has no unpaid invoices.</p> : open.map((i) => <div key={i.id} className="flex items-center justify-between gap-3 text-body-sm"><span>{i.invoiceNo} · due {day(i.dueDate)} · balance <strong className="tabular">{money(i.balance)}</strong></span><input className={`${inputCls} w-32 text-right`} inputMode="decimal" placeholder="₹" aria-label={`Amount for ${i.invoiceNo}`} value={amounts[i.id] ?? ""} onChange={(e) => setAmounts((a) => ({ ...a, [i.id]: e.target.value }))} data-testid={`alloc-${i.invoiceNo}`} /></div>)}
      {err && <p className="text-danger" role="alert" data-testid="alloc-error">{err}</p>}
      <div><button className={btn("primary")} disabled={!list.length || sum > p.unallocated || go.isPending} onClick={() => go.mutate(undefined, { onError: (e) => setErr(errorMessage(e)) })} data-testid="alloc-go">Apply {money(sum)}</button></div>
    </div>
  );
}
function PaymentActions({ p, invoices, onDone }: { p: B2BPayment; invoices: B2BInvoice[]; onDone: () => void }) {
  const { can } = useAuth();
  const [open, setOpen] = React.useState<"" | "reject" | "reverse" | "allocate">("");
  const [reason, setReason] = React.useState("");
  const [err, setErr] = React.useState<string>();
  const done = () => { setOpen(""); setErr(undefined); onDone(); };
  const verify = useB2BAction(() => b2bApi.verifyPayment(p.id), "Payment verified", done);
  const reject = useB2BAction(() => b2bApi.rejectPayment(p.id, reason.trim()), "Payment rejected", done);
  const reverse = useB2BAction(() => b2bApi.reversePayment(p.id, reason.trim()), "Payment reversed", done);
  const treasury = can(P.ACCOUNTING_CREATE_PAYMENT);
  if (!treasury) return <span className="text-muted">—</span>;
  const onErr = { onError: (e: unknown) => setErr(errorMessage(e)) };
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {p.status === "PENDING_VERIFICATION" && <><button className={btn("primary")} onClick={() => verify.mutate(undefined, onErr)} data-testid="pay-verify">Verify</button><button className={btn("danger")} onClick={() => setOpen("reject")}>Reject</button></>}
        {p.status === "VERIFIED" && p.unallocated > 0 && <button className={btn("primary")} onClick={() => setOpen("allocate")} data-testid="pay-allocate">Apply to invoices</button>}
        {p.status === "VERIFIED" && <button className={btn("danger")} onClick={() => setOpen("reverse")}>Reverse</button>}
      </div>
      {err && <p className="text-caption text-danger" role="alert" data-testid="pay-error">{err}</p>}
      {(open === "reject" || open === "reverse") && <div className="flex items-end gap-2"><input className={`${inputCls} w-64`} placeholder="Reason" value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Reason" /><button className={btn("danger")} disabled={!reason.trim()} onClick={() => (open === "reject" ? reject : reverse).mutate(undefined, onErr)}>Confirm {open}</button></div>}
      {open === "allocate" && <Allocator p={p} invoices={invoices} onDone={done} />}
    </div>
  );
}
function RecordPayment({ customers, onDone }: { customers: B2BCustomerRow[]; onDone: () => void }) {
  const [f, setF] = React.useState({ customerId: "", method: "NEFT", amount: "", receivedDate: new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10), reference: "", bankName: "" });
  const [err, setErr] = React.useState<string>();
  const amount = rupeesToPaise(f.amount);
  const save = useB2BAction(() => b2bApi.recordPayment({ ...f, amount, reference: f.reference.trim() || undefined, bankName: f.bankName.trim() || undefined }), "Payment recorded — awaiting verification", () => { setF({ ...f, amount: "", reference: "" }); onDone(); });
  return (
    <div className="grid gap-3 rounded-lg border border-border bg-surface p-4 sm:grid-cols-3 lg:grid-cols-6" data-testid="record-payment">
      <Field label="Customer"><select className={inputCls} value={f.customerId} onChange={(e) => setF({ ...f, customerId: e.target.value })} data-testid="rec-customer"><option value="">Choose…</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
      <Field label="Method"><select className={inputCls} value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })} data-testid="rec-method">{B2B_PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m.replace("_", " ")}</option>)}</select></Field>
      <Field label="Amount (₹)"><input className={inputCls} inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} data-testid="rec-amount" /></Field>
      <Field label="Date received"><input type="date" className={inputCls} value={f.receivedDate} onChange={(e) => setF({ ...f, receivedDate: e.target.value })} /></Field>
      <Field label="UTR / cheque no."><input className={inputCls} value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} data-testid="rec-ref" /></Field>
      <Field label="Bank"><input className={inputCls} value={f.bankName} onChange={(e) => setF({ ...f, bankName: e.target.value })} /></Field>
      <div className="flex items-end gap-3 sm:col-span-3 lg:col-span-6"><button className={btn("primary")} disabled={!f.customerId || !amount || save.isPending} onClick={() => save.mutate(undefined, { onError: (e) => setErr(errorMessage(e)) })} data-testid="rec-go">Record payment</button><span className="text-caption text-muted">Recording never marks an invoice paid: a second person verifies it, then it is applied to invoices.</span>{err && <span className="text-danger" role="alert">{err}</span>}</div>
    </div>
  );
}
export function OutstandingView() {
  const { can } = useAuth();
  const inv = useB2BInvoices();
  const pay = useB2BPayments();
  const customers = useB2BCustomers();
  const [tab, setTab] = React.useState<"invoices" | "payments">("invoices");
  const unpaid = (inv.data ?? []).filter((i) => i.balance > 0).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const refresh = () => { inv.refetch(); pay.refetch(); customers.refetch(); };
  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-1.5" role="tablist" aria-label="View">{([["invoices", `Unpaid invoices (${unpaid.length})`], ["payments", `Payments (${pay.data?.length ?? 0})`]] as const).map(([v, l]) => <button key={v} role="tab" aria-selected={tab === v} className={`h-8 rounded-full border px-3 text-caption ${tab === v ? "border-foreground bg-foreground text-background" : "border-border bg-surface"}`} onClick={() => setTab(v)} data-testid={`tab-${v}`}>{l}</button>)}</div>
      {tab === "invoices" && <Load q={inv}><Table testId="b2b-invoices"><thead><tr><Th>Invoice</Th><Th>Customer</Th><Th>Due</Th><Th right>Total</Th><Th right>Paid</Th><Th right>Balance</Th><Th>Status</Th></tr></thead><tbody>{unpaid.map((i) => <tr key={i.id} data-testid="b2b-invoice-row"><Td className="font-medium">{i.invoiceNo}</Td><Td>{i.customer.name}</Td><Td>{day(i.dueDate)}{i.daysOverdue > 0 && <span className="ml-1 text-danger">({i.daysOverdue}d)</span>}</Td><Td right>{money(i.totals.total)}</Td><Td right>{money(i.paid)}</Td><Td right className="font-semibold">{money(i.balance)}</Td><Td><Status s={i.status} /></Td></tr>)}</tbody></Table></Load>}
      {tab === "payments" && <>
        {can(P.ACCOUNTING_CREATE_PAYMENT) && customers.data && <RecordPayment customers={customers.data} onDone={refresh} />}
        <Load q={pay}><Table testId="b2b-payments"><thead><tr><Th>Payment</Th><Th>Customer</Th><Th>Received</Th><Th>Method</Th><Th>Reference</Th><Th right>Amount</Th><Th right>Applied</Th><Th>Status</Th><Th>Actions</Th></tr></thead><tbody>{(pay.data ?? []).map((p) => <tr key={p.id} className="align-top" data-testid="b2b-payment-row"><Td className="font-medium">{p.paymentNo}<span className="block text-caption font-normal text-muted">{p.source === "CUSTOMER" ? `Reported by ${p.recordedByName ?? "customer"}` : `Entered by ${p.recordedByName ?? "staff"}`}</span></Td><Td>{p.customer.name}</Td><Td>{day(p.receivedDate)}</Td><Td>{p.method.replace("_", " ")}</Td><Td className="text-muted">{p.reference ?? "—"}</Td><Td right>{money(p.amount)}</Td><Td right>{money(p.allocated)}</Td><Td><Status s={p.status} />{p.verifiedByName && <span className="block text-caption text-muted">by {p.verifiedByName}</span>}</Td><Td><PaymentActions p={p} invoices={inv.data ?? []} onDone={refresh} /></Td></tr>)}</tbody></Table></Load>
      </>}
    </div>
  );
}
