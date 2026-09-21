"use client";

import * as React from "react";
import type { B2BPurchaseOrder } from "@jewellery/types";
import { PERMISSIONS as P } from "@jewellery/types";
import { useAuth } from "../../lib/auth/auth-context";
import { b2bApi, useB2BAction, useB2BPurchaseOrders } from "../../lib/api/b2b";
import { Field, Load, Status, Table, Td, Th, btn, CreditVerdict, day, inputCls, money, rupeesToPaise } from "./shared";

const GROUPS: [string, string][] = [["", "All"], ["SUBMITTED,UNDER_REVIEW", "To review"], ["QUOTED,NEGOTIATING", "Quoted / negotiating"], ["APPROVED", "Approved"], ["REJECTED,CANCELLED,DRAFT", "Other"]];

function Detail({ po, onDone }: { po: B2BPurchaseOrder; onDone: () => void }) {
  const { can } = useAuth();
  const [mode, setMode] = React.useState<"none" | "approve" | "quote" | "reject">("none");
  const [reason, setReason] = React.useState("");
  const [terms, setTerms] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [validDays, setValidDays] = React.useState("7");
  const [conc, setConc] = React.useState<Record<string, { pct: string; price: string }>>({});
  const done = () => { setMode("none"); onDone(); };
  const review = useB2BAction(() => b2bApi.review(po.id), "Review started", done);
  const approve = useB2BAction(() => b2bApi.approve(po.id, reason.trim() ? { creditOverride: { reason: reason.trim() } } : {}), "Approved — sales order created", done);
  const reject = useB2BAction(() => b2bApi.reject(po.id, reason.trim()), "Rejected", done);
  const lines = po.lines.flatMap((l): { sku: string; discountPercent?: number; unitTaxable?: number }[] => {
    const c = conc[l.sku];
    if (!c) return [];
    const pct = Number(c.pct), price = rupeesToPaise(c.price);
    return c.pct.trim() && pct > 0 ? [{ sku: l.sku, discountPercent: pct }] : c.price.trim() && price ? [{ sku: l.sku, unitTaxable: price }] : [];
  });
  const quote = useB2BAction(() => b2bApi.quote(po.id, { lines, validDays: Number(validDays) || 7, ...(terms.trim() ? { terms: terms.trim() } : {}), ...(message.trim() ? { message: message.trim() } : {}) }), "Quotation issued", done);
  const open = ["SUBMITTED", "UNDER_REVIEW", "QUOTED", "NEGOTIATING"].includes(po.status) && can(P.B2B_APPROVE_PO); // UI convenience only: the API enforces it
  const needsOverride = !!po.credit?.requiresApproval;
  const mayOverride = can(P.B2B_OVERRIDE_CREDIT);

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4" data-testid="po-detail">
      <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-h4 font-semibold">{po.poNo} <span className="font-normal text-muted">· {po.customer.name}{po.customerPoRef && ` · ref ${po.customerPoRef}`}</span></h3><Status s={po.status} /></div>
      <Table><thead><tr><Th>SKU</Th><Th>Item</Th><Th right>Qty</Th><Th right>Unit (ex GST)</Th><Th right>Line total</Th>{mode === "quote" && <><Th right>Discount %</Th><Th right>or target ₹</Th></>}</tr></thead><tbody>
        {po.lines.map((l) => (
          <tr key={l.sku}><Td className="font-medium tabular">{l.sku}</Td><Td>{l.name}</Td><Td right>{l.quantity}</Td><Td right>{l.priceOnRequest ? <span className="text-warning">on request</span> : money(l.unitTaxable)}</Td><Td right>{l.priceOnRequest ? "—" : money(l.lineTotal)}</Td>
            {mode === "quote" && <><Td right><input className={`${inputCls} w-20 text-right`} aria-label={`Discount % for ${l.sku}`} inputMode="decimal" value={conc[l.sku]?.pct ?? ""} onChange={(e) => setConc((c) => ({ ...c, [l.sku]: { pct: e.target.value, price: "" } }))} data-testid={`pct-${l.sku}`} /></Td><Td right><input className={`${inputCls} w-28 text-right`} aria-label={`Target price for ${l.sku}`} inputMode="decimal" value={conc[l.sku]?.price ?? ""} onChange={(e) => setConc((c) => ({ ...c, [l.sku]: { pct: "", price: e.target.value } }))} /></Td></>}
          </tr>
        ))}
      </tbody></Table>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex max-w-md flex-col gap-2"><p className="text-body-sm text-muted">Total {money(po.totals.total)}{!po.totals.complete && " (price-on-request lines not included)"} · ships to {po.shippingAddress.city}, {po.shippingAddress.state}{po.requestedDeliveryDate && ` · needed by ${day(po.requestedDeliveryDate)}`}</p>{po.notes && <p className="text-body-sm">Customer note: {po.notes}</p>}{po.credit && <CreditVerdict check={po.credit} />}</div>
      </div>
      {open && mode === "none" && (
        <div className="flex flex-wrap gap-2">
          {po.status === "SUBMITTED" && <button className={btn()} onClick={() => review.mutate(undefined)} data-testid="po-review">Start review</button>}
          {(po.status === "SUBMITTED" || po.status === "UNDER_REVIEW") && <button className={btn("primary")} onClick={() => setMode("approve")} data-testid="po-approve">Approve…</button>}
          <button className={btn()} onClick={() => setMode("quote")} data-testid="po-quote">{po.status === "QUOTED" || po.status === "NEGOTIATING" ? "Revise quotation…" : "Quote…"}</button>
          <button className={btn("danger")} onClick={() => setMode("reject")} data-testid="po-reject">Reject…</button>
        </div>
      )}
      {mode === "approve" && (
        <div className="flex flex-col gap-3 rounded-md border border-border-subtle p-3" data-testid="approve-form">
          <p className="text-body-sm">Approving creates the sales order at today’s price for this customer. {needsOverride ? (mayOverride ? "This order exceeds the customer’s terms: give a reason to override, or approve without one and it will be held for credit." : "This order exceeds the customer’s terms. It will be held for credit approval — you don’t have the override permission.") : "It is within the customer’s credit terms."}</p>
          {needsOverride && mayOverride && <Field label="Credit override reason (min 10 characters)"><input className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} data-testid="override-reason" /></Field>}
          <div className="flex gap-2"><button className={btn("primary")} disabled={approve.isPending || (reason.trim().length > 0 && reason.trim().length < 10)} onClick={() => approve.mutate(undefined)} data-testid="approve-go">{needsOverride && reason.trim() ? "Approve and override credit" : "Approve"}</button><button className={btn()} onClick={() => setMode("none")}>Cancel</button></div>
        </div>
      )}
      {mode === "quote" && (
        <div className="grid gap-3 rounded-md border border-border-subtle p-3 sm:grid-cols-3" data-testid="quote-form">
          <p className="text-body-sm text-muted sm:col-span-3">Only list lines you want to concede on: a percentage off, or a target price before GST. The engine recalculates GST and rounding; the prices are frozen for the validity period.</p>
          <Field label="Valid for (days)"><input className={inputCls} inputMode="numeric" value={validDays} onChange={(e) => setValidDays(e.target.value)} /></Field>
          <Field label="Terms"><input className={inputCls} value={terms} onChange={(e) => setTerms(e.target.value)} /></Field>
          <Field label="Message to customer"><input className={inputCls} value={message} onChange={(e) => setMessage(e.target.value)} /></Field>
          <div className="flex gap-2 sm:col-span-3"><button className={btn("primary")} disabled={quote.isPending} onClick={() => quote.mutate(undefined)} data-testid="quote-go">Issue quotation</button><button className={btn()} onClick={() => setMode("none")}>Cancel</button></div>
        </div>
      )}
      {mode === "reject" && (
        <div className="flex flex-col gap-3 rounded-md border border-border-subtle p-3"><Field label="Reason (the customer will see it)"><input className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} data-testid="reject-reason" /></Field><div className="flex gap-2"><button className={btn("danger")} disabled={!reason.trim() || reject.isPending} onClick={() => reject.mutate(undefined)} data-testid="reject-go">Reject</button><button className={btn()} onClick={() => setMode("none")}>Cancel</button></div></div>
      )}
    </div>
  );
}

export function PurchaseOrdersView() {
  const [g, setG] = React.useState("");
  const q = useB2BPurchaseOrders(g || undefined);
  const [sel, setSel] = React.useState<string>();
  const items = q.data ?? [];
  const current = items.find((p) => p.id === sel);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Filter">{GROUPS.map(([v, l]) => <button key={l} role="tab" aria-selected={g === v} className={`h-8 rounded-full border px-3 text-caption ${g === v ? "border-foreground bg-foreground text-background" : "border-border bg-surface"}`} onClick={() => setG(v)}>{l}</button>)}</div>
      <Load q={q}>
        {items.length === 0 ? <p className="rounded-lg border border-dashed border-border p-10 text-center text-muted">Nothing here.</p> : (
          <Table testId="b2b-po-table"><thead><tr><Th>PO</Th><Th>Customer</Th><Th>Their ref</Th><Th>Submitted</Th><Th right>Total</Th><Th>Credit</Th><Th>Status</Th></tr></thead><tbody>
            {items.map((p) => <tr key={p.id} className={`cursor-pointer hover:bg-surface-sunken ${sel === p.id ? "bg-surface-sunken" : ""}`} onClick={() => setSel(p.id)} data-testid="b2b-po-row"><Td className="font-medium">{p.poNo}</Td><Td>{p.customer.name}</Td><Td className="text-muted">{p.customerPoRef ?? "—"}</Td><Td>{p.submittedAt ? day(p.submittedAt) : "—"}</Td><Td right>{money(p.totals.total)}</Td><Td>{p.credit?.requiresApproval ? <span className="text-danger">Over terms</span> : <span className="text-muted">OK</span>}</Td><Td><Status s={p.status} /></Td></tr>)}
          </tbody></Table>
        )}
      </Load>
      {current && <Detail key={current.id + current.status} po={current} onDone={() => q.refetch()} />}
    </div>
  );
}
