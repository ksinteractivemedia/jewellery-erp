"use client";

import Link from "next/link";
import { Minus, Plus, ShoppingBag, X } from "lucide-react";
import { Skeleton } from "@jewellery/ui";
import { cart, cartCount, lineKey, useCartLines } from "../../lib/cart";
import { formatMoney } from "../../lib/money";
import { useCartQuote } from "../../lib/queries";
import { PriceTag } from "../product/price";
import { ProgressiveImage } from "../ui/progressive-image";

/** The bag page. Every figure — each piece's price, how many can be bought, the totals — is re-read from the server; the browser only remembers what was chosen. */
export function CartView() {
  const lines = useCartLines();
  const quote = useCartQuote(lines);
  const q = quote.data;

  if (lines.length === 0) {
    return (
      <div className="flex flex-col items-center gap-5 py-24 text-center" data-testid="cart-empty">
        <ShoppingBag className="h-10 w-10 text-muted" strokeWidth={1.25} aria-hidden="true" />
        <h2 className="font-display text-h2">Your bag is empty</h2>
        <p className="max-w-sm text-body text-muted">Pieces you add will wait here. Their prices follow the metal rate, so they’re re-checked each time you look.</p>
        <div className="flex gap-3"><Link href="/collections" className="btn btn-primary">Explore collections</Link><Link href="/wishlist" className="btn btn-outline">View wishlist</Link></div>
      </div>
    );
  }
  if (quote.isError && !q) {
    return <div role="alert" className="flex flex-col items-center gap-4 border border-dashed border-border py-20 text-center"><p className="font-display text-h3">We couldn’t price your bag</p><button className="btn btn-outline btn-sm" onClick={() => quote.refetch()}>Try again</button></div>;
  }

  return (
    <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-16 pb-24 lg:pb-0" data-testid="cart-page">
      <ul className="flex flex-col divide-y divide-border-subtle border-y border-border-subtle" aria-label="Items in your bag" data-testid="cart-lines">
        {!q ? lines.map((l) => <li key={lineKey(l)} className="py-6"><Skeleton className="h-36" /></li>) : q.lines.map((l) => {
          const key = lineKey(l);
          return (
            <li key={key} className="flex gap-5 py-6 sm:gap-8" data-testid="cart-line">
              <Link href={`/product/${l.slug}`} className="w-28 shrink-0 sm:w-36"><ProgressiveImage src={l.image?.url} alt={l.image?.alt ?? l.name} ratio="aspect-[4/5]" /></Link>
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <div className="flex items-start justify-between gap-3">
                  <Link href={`/product/${l.slug}`} className="font-display text-h4 leading-snug hover:text-muted">{l.name}</Link>
                  <button type="button" onClick={() => cart.remove(key)} aria-label={`Remove ${l.name} from bag`} className="-mr-2 rounded-full p-2 text-muted hover:text-foreground"><X className="h-4 w-4" /></button>
                </div>
                {l.variantLabel && <p className="text-body-sm text-muted">Size {l.variantLabel}</p>}
                <PriceTag price={l.unitPrice} size="md" />
                {l.notes.map((n) => <p key={n} className="text-body-sm text-warning" role="status">{n}</p>)}
                <div className="mt-auto flex flex-wrap items-end justify-between gap-x-4 gap-y-1 pt-2">
                  {l.maxQuantity > 0 ? (
                    <div className="inline-flex items-center border border-border" role="group" aria-label={`Quantity of ${l.name}`}>
                      <button type="button" className="flex h-11 w-11 items-center justify-center hover:bg-surface-sunken" onClick={() => cart.setQuantity(key, l.quantity - 1)} aria-label="Decrease quantity"><Minus className="h-4 w-4" /></button>
                      <span className="tabular w-10 text-center text-body" aria-live="polite" data-testid="line-qty">{l.quantity}</span>
                      <button type="button" className="flex h-11 w-11 items-center justify-center hover:bg-surface-sunken disabled:opacity-30" disabled={l.quantity >= l.maxQuantity} onClick={() => cart.setQuantity(key, l.quantity + 1)} aria-label="Increase quantity"><Plus className="h-4 w-4" /></button>
                    </div>
                  ) : <span />}
                  {l.lineTotal !== null && l.quantity > 1 && <span className="tabular text-body font-medium">{formatMoney(l.lineTotal)}</span>}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      <aside className="flex h-fit flex-col gap-5 bg-surface p-6 sm:p-8 lg:sticky lg:top-28" aria-label="Order summary" data-testid="cart-summary">
        <h2 className="font-display text-h3">Summary</h2>
        {q ? (
          <dl className="flex flex-col gap-3 text-body">
            <div className="flex justify-between"><dt className="text-muted">Value before GST</dt><dd className="tabular" data-testid="summary-taxable">{formatMoney(q.totals.taxableValue)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">GST</dt><dd className="tabular" data-testid="summary-gst">{formatMoney(q.totals.gst)}</dd></div>
            <div className="flex items-baseline justify-between border-t border-foreground pt-4"><dt className="font-medium">{q.totals.complete ? "Total" : "Total (priced pieces)"}</dt><dd className="tabular font-display text-h3" data-testid="summary-total">{formatMoney(q.totals.total)}</dd></div>
          </dl>
        ) : <Skeleton className="h-28" />}
        {q && !q.totals.complete && <p className="text-body-sm text-warning" role="status">Some pieces aren’t included in this total — they’re unavailable or priced on request.</p>}
        <p className="text-caption leading-relaxed text-muted">Inclusive of GST. Jewellery prices follow the metal rate, so this total is worked out now and confirmed when you check out.</p>
        <Link href="/checkout" className="btn btn-primary hidden w-full lg:inline-flex" data-testid="checkout-link">Proceed to checkout</Link>
        <Link href="/collections" className="link-quiet text-center text-body-sm text-muted">Continue shopping</Link>
      </aside>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur lg:hidden" data-testid="cart-sticky">
        <div className="flex items-center gap-4">
          <div className="flex flex-col"><span className="text-caption text-muted">Total · {cartCount(lines)} {cartCount(lines) === 1 ? "piece" : "pieces"}</span><span className="tabular font-display text-h4">{q ? formatMoney(q.totals.total) : "—"}</span></div>
          <Link href="/checkout" className="btn btn-primary ml-auto">Checkout</Link>
        </div>
      </div>
    </div>
  );
}
