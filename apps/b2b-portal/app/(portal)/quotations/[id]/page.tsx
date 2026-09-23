"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { date, dateTime, money, rupeesToPaise } from "../../../../lib/money";
import { QUOTE_LABEL } from "../../../../lib/status";
import { acceptQuotation, counterQuotation, declineQuotation, key, useQuotation } from "../../../../lib/queries";
import { DocLines } from "../../../../components/lines";
import { Failure, Loading, PageHead, StatusPill, TotalsBox } from "../../../../components/ui";

export default function QuotationPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const q = useQuotation(id);
  const [mode, setMode] = React.useState<"none" | "counter" | "decline">("none");
  const [message, setMessage] = React.useState("");
  const [asks, setAsks] = React.useState<Record<string, string>>({});
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string>();
  if (q.isLoading) return <Loading rows={6} />;
  if (q.isError || !q.data) return <Failure error={q.error} retry={() => q.refetch()} />;
  const quote = q.data;
  // NEGOTIATION means you've already sent a counter-offer and we're preparing a revised quotation — nothing more to do yet.
  const live = quote.status === "QUOTED";
  const run = async (fn: () => Promise<unknown>, then?: () => void) => { setBusy(true); setError(undefined); try { await fn(); await qc.invalidateQueries({ queryKey: key.all }); then?.(); setMode("none"); } catch (e) { setError(e instanceof Error ? e.message : "That didn’t work."); } setBusy(false); };
  const requested = Object.entries(asks).flatMap(([sku, v]) => { const p = rupeesToPaise(v); return v.trim() && p ? [{ sku, unitTaxable: p }] : []; });

  return (
    <>
      <PageHead title={`${quote.quoteNo} · version ${quote.version}`} sub={<>For <Link className="underline underline-offset-2" href={`/purchase-orders/${quote.purchaseOrderId}`}>{quote.poNo}</Link> · issued {dateTime(quote.issuedAt)} · valid until {date(quote.validUntil)}</>} actions={<StatusPill map={QUOTE_LABEL} status={quote.status} />} />
      {quote.status === "EXPIRED" && <p className="mb-4 rounded-md border border-danger bg-danger-subtle p-3 text-danger" role="alert">This quotation has expired. Ask your salesperson for a new one.</p>}
      {quote.status === "SUPERSEDED" && <p className="mb-4 rounded-md border border-border bg-surface-sunken p-3 text-muted" role="status">A newer version of this quotation has been issued. Only the latest can be accepted.</p>}
      {error && <p className="mb-3 text-danger" role="alert" data-testid="quote-error">{error}</p>}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section className="flex flex-col gap-4">
          <DocLines lines={quote.lines} testId="quote-lines" />
          {mode === "counter" && (
            <div className="card flex flex-col gap-3 p-4" data-testid="counter-form">
              <h2 className="font-semibold">Ask for changes</h2>
              <p className="text-[0.8125rem] text-muted">Tell us what would work. You can name a price you’d like per line (before GST); we’ll reply with a revised quotation.</p>
              <ul className="flex flex-col gap-2">{quote.lines.map((l) => <li key={l.sku} className="flex items-center justify-between gap-3 text-[0.8125rem]"><span><span className="num font-medium">{l.sku}</span> · now {money(l.unitTaxable)}</span><input className="field num w-32 text-right" inputMode="decimal" placeholder="Your price ₹" aria-label={`Requested price for ${l.sku}`} value={asks[l.sku] ?? ""} onChange={(e) => setAsks((a) => ({ ...a, [l.sku]: e.target.value }))} data-testid={`ask-${l.sku}`} /></li>)}</ul>
              <textarea className="field h-auto py-2" rows={3} placeholder="Your message" aria-label="Message" value={message} onChange={(e) => setMessage(e.target.value)} data-testid="counter-message" />
              <div className="flex gap-2"><button className="btn btn-primary" disabled={busy || !message.trim()} onClick={() => run(() => counterQuotation(quote.id, { message: message.trim(), ...(requested.length ? { requestedPrices: requested } : {}) }))} data-testid="send-counter">Send to Suvarna</button><button className="btn btn-ghost" onClick={() => setMode("none")}>Cancel</button></div>
            </div>
          )}
          <div className="card p-4"><h2 className="mb-3 font-semibold">Conversation</h2>
            {quote.messages.length === 0 ? <p className="text-muted">No messages yet.</p> : <ul className="flex flex-col gap-3" data-testid="messages">{quote.messages.map((m, i) => <li key={i} className={`max-w-[85%] rounded-lg border p-3 text-[0.8125rem] ${m.by === "CUSTOMER" ? "ml-auto border-primary bg-primary-subtle" : "border-border-subtle bg-surface-sunken"}`}><p className="mb-0.5 text-[0.6875rem] text-muted">{m.by === "CUSTOMER" ? "You" : "Suvarna"} · {dateTime(m.at)}</p><p>{m.text}</p>{m.requestedPrices && <p className="mt-1 text-muted">Requested: {m.requestedPrices.map((r) => `${r.sku} at ${money(r.unitTaxable)}`).join(", ")}</p>}</li>)}</ul>}
          </div>
        </section>
        <aside className="flex flex-col gap-4">
          <div className="card flex flex-col gap-3 p-4"><TotalsBox taxable={quote.totals.taxable} gst={quote.totals.gst} total={quote.totals.total} testId="quote-totals" /><p className="text-[0.75rem] text-muted">These prices are fixed for you until {date(quote.validUntil)}, whatever the metal rate does.</p></div>
          {quote.terms && <div className="card p-4 text-[0.8125rem]"><p className="label mb-1">Terms</p><p>{quote.terms}</p></div>}
          {quote.status === "NEGOTIATION" && <p className="card p-4 text-[0.8125rem] text-muted" data-testid="negotiating">We’re preparing a revised quotation based on your counter-offer.</p>}
          {live && (
            <div className="flex flex-col gap-2">
              <button className="btn btn-primary h-10" disabled={busy} onClick={() => run(async () => { await acceptQuotation(quote.id); router.push(`/purchase-orders/${quote.purchaseOrderId}`); })} data-testid="accept-quote">Accept quotation</button>
              <button className="btn btn-outline" disabled={busy} onClick={() => setMode("counter")} data-testid="counter-quote">Ask for changes</button>
              {mode !== "decline" ? <button className="btn btn-danger" onClick={() => setMode("decline")} data-testid="decline-quote">Decline</button> : <div className="card flex items-center justify-between gap-2 p-3" role="alertdialog" aria-label="Confirm decline"><span>Decline this quotation?</span><span className="flex gap-2"><button className="btn btn-danger btn-sm" disabled={busy} onClick={() => run(() => declineQuotation(quote.id))} data-testid="confirm-decline">Yes, decline</button><button className="btn btn-ghost btn-sm" onClick={() => setMode("none")}>Keep</button></span></div>}
            </div>
          )}
          {quote.status === "APPROVED" && <Link href={`/purchase-orders/${quote.purchaseOrderId}`} className="btn btn-outline">View the purchase order</Link>}
          {quote.status === "CONVERTED" && <Link href={`/purchase-orders/${quote.purchaseOrderId}`} className="btn btn-outline">View the order</Link>}
        </aside>
      </div>
    </>
  );
}
