"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Trash2 } from "lucide-react";
import type { B2BResolvedLine } from "@jewellery/types";
import { ApiError } from "../../../lib/api";
import { cartStore, useCart } from "../../../lib/cart";
import { blocking } from "../../../lib/quick-order";
import { money, today } from "../../../lib/money";
import { createPurchaseOrder, key, useAccount, useCartQuote } from "../../../lib/queries";
import { LinePrice, Problems } from "../../../components/lines";
import { CreditPanel, CreditWarning, Empty, Failure, Loading, PageHead, TotalsBox } from "../../../components/ui";

export default function CartPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const cart = useCart();
  const account = useAccount();
  const [addr, setAddr] = React.useState(0);
  const [ref, setRef] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [needBy, setNeedBy] = React.useState("");
  const [busy, setBusy] = React.useState<"draft" | "submit" | null>(null);
  const [error, setError] = React.useState<string>();
  const [blockedLines, setBlockedLines] = React.useState<B2BResolvedLine[]>();
  const quote = useCartQuote(cart, addr);
  const q = cart.length ? quote.data : undefined;
  const bySku = new Map(q?.lines.map((l) => [l.sku, l]));
  const addresses = account.data?.shippingAddresses ?? [];

  if (cart.length === 0) return <><PageHead title="Cart" /><Empty title="Your cart is empty" hint="Add items from the catalogue, or type SKUs into Quick order." action={<div className="flex gap-2"><Link href="/quick-order" className="btn btn-primary">Quick order</Link><Link href="/catalogue" className="btn btn-outline">Catalogue</Link></div>} /></>;

  const send = async (submit: boolean) => {
    setBusy(submit ? "submit" : "draft");
    setError(undefined);
    setBlockedLines(undefined);
    try {
      const { purchaseOrder } = await createPurchaseOrder({ lines: cart.map((l) => ({ sku: l.sku, quantity: l.quantity })), shippingAddressIndex: addr, submit, ...(ref.trim() ? { customerPoRef: ref.trim() } : {}), ...(notes.trim() ? { notes: notes.trim() } : {}), ...(needBy ? { requestedDeliveryDate: needBy } : {}) });
      cartStore.clear();
      await qc.invalidateQueries({ queryKey: key.all });
      router.push(`/purchase-orders/${purchaseOrder.id}`);
    } catch (e) {
      if (e instanceof ApiError && e.code === "ORDER_BLOCKED") setBlockedLines((e.details as { lines: B2BResolvedLine[] }).lines);
      setError(e instanceof Error ? e.message : "We couldn’t create the purchase order.");
      setBusy(null);
    }
  };
  const canSend = !!q && q.canSubmit && !!busy === false && addresses.length > 0;

  return (
    <>
      <PageHead title="Cart" sub="Review your lines, choose where it ships, then send it to us as a purchase order." />
      {quote.isError && <Failure error={quote.error} retry={() => quote.refetch()} />}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section aria-label="Cart lines">
          {!q ? <Loading rows={cart.length} /> : (
            <div className="card overflow-x-auto"><table className="tbl" data-testid="cart-lines">
              <thead><tr><th>SKU / item</th><th className="text-right">Qty</th><th className="text-right">Unit (ex GST)</th><th className="text-right">Line total</th><th /></tr></thead>
              <tbody>{cart.map((c) => {
                const l = bySku.get(c.sku);
                return (
                  <tr key={c.sku} data-testid="cart-line" className="align-top">
                    <td><p className="num font-medium">{c.sku}</p>{l?.item && <p>{l.item.name}</p>}{l?.item && <p className="text-[0.75rem] text-muted">{l.item.metal} {l.item.purity} · {l.item.available} in stock · MOQ {l.item.minOrderQuantity}</p>}{l && <Problems line={l} />}</td>
                    <td className="text-right"><input className="field num w-20 text-right" inputMode="numeric" aria-label={`Quantity of ${c.sku}`} value={c.quantity} onChange={(e) => cartStore.setQuantity(c.sku, Number(e.target.value.replace(/\D/g, "")) || 0)} data-testid={`cart-qty-${c.sku}`} /></td>
                    <td className="text-right">{l ? <LinePrice line={l} /> : null}</td>
                    <td className="num text-right font-medium">{l?.lineTotal != null ? money(l.lineTotal) : "—"}</td>
                    <td><button className="btn btn-ghost h-8 w-8 p-0" aria-label={`Remove ${c.sku}`} onClick={() => cartStore.remove(c.sku)}><Trash2 className="h-4 w-4" aria-hidden="true" /></button></td>
                  </tr>
                );
              })}</tbody>
            </table></div>
          )}
          {blockedLines && <ul className="mt-3 rounded-md border border-danger bg-danger-subtle p-3 text-[0.8125rem] text-danger" role="alert">{blockedLines.flatMap((l) => l.problems.filter((p) => p.blocking).map((p) => <li key={l.sku + p.code}>{p.message}</li>))}</ul>}
        </section>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-20 lg:self-start" aria-label="Purchase order">
          <div className="card flex flex-col gap-3 p-4">
            <h2 className="font-semibold">Purchase order details</h2>
            <div className="flex flex-col gap-1.5"><label className="label" htmlFor="addr">Ship to</label>
              {addresses.length === 0 ? <p className="text-[0.8125rem] text-danger" role="alert">No shipping address on your account — ask your salesperson to add one.</p> : <select id="addr" className="field" value={addr} onChange={(e) => setAddr(Number(e.target.value))} data-testid="ship-to">{addresses.map((a, i) => <option key={i} value={i}>{a.line1}, {a.city}, {a.state} {a.postalCode}</option>)}</select>}</div>
            <div className="flex flex-col gap-1.5"><label className="label" htmlFor="ref">Your PO number <span className="font-normal normal-case tracking-normal">(optional)</span></label><input id="ref" className="field" value={ref} onChange={(e) => setRef(e.target.value)} maxLength={60} data-testid="po-ref" /></div>
            <div className="flex flex-col gap-1.5"><label className="label" htmlFor="need">Needed by <span className="font-normal normal-case tracking-normal">(optional)</span></label><input id="need" type="date" min={today()} className="field" value={needBy} onChange={(e) => setNeedBy(e.target.value)} /></div>
            <div className="flex flex-col gap-1.5"><label className="label" htmlFor="notes">Notes <span className="font-normal normal-case tracking-normal">(optional)</span></label><textarea id="notes" rows={2} className="field h-auto py-2" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} /></div>
          </div>
          <div className="card flex flex-col gap-4 p-4">
            {q ? <TotalsBox taxable={q.totals.taxable} gst={q.totals.gst} total={q.totals.total} complete={q.totals.complete} testId="cart-totals" /> : <Loading rows={3} />}
            {q && <><CreditPanel p={q.credit.position} compact /><CreditWarning check={q.credit} /></>}
            {q && !q.canSubmit && <p className="text-[0.8125rem] text-danger" role="alert" data-testid="cart-blocked">Fix the lines marked in red to continue.</p>}
            {error && !blockedLines && <p className="text-[0.8125rem] text-danger" role="alert" data-testid="cart-error">{error}</p>}
            <button className="btn btn-primary h-10" disabled={!canSend} onClick={() => send(true)} data-testid="submit-po">{busy === "submit" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}Submit purchase order</button>
            <button className="btn btn-outline" disabled={!canSend} onClick={() => send(false)} data-testid="save-draft">{busy === "draft" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}Save as draft</button>
            <p className="text-[0.75rem] text-muted">Submitting sends it to our team for review. Prices are confirmed when we approve or quote it.</p>
          </div>
        </aside>
      </div>
    </>
  );
}
