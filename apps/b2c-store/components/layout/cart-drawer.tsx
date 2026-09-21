"use client";

import Link from "next/link";
import { Minus, Plus, ShoppingBag, X } from "lucide-react";
import { Drawer, DrawerBody, DrawerContent, DrawerFooter, DrawerHeader, DrawerTitle, Skeleton } from "@jewellery/ui";
import { cart, cartCount, lineKey, useCartDrawerOpen, useCartLines } from "../../lib/cart";
import { useCartQuote } from "../../lib/queries";
import { formatMoney } from "../../lib/money";
import { ProgressiveImage } from "../ui/progressive-image";
import { PriceTag } from "../product/price";

/** The bag, priced by the server every time it opens: what each piece costs today and how many can really be bought. */
export function CartDrawer() {
  const open = useCartDrawerOpen();
  const lines = useCartLines();
  const quote = useCartQuote(lines);
  const q = quote.data;
  return (
    <Drawer open={open} onOpenChange={(o) => cart.openDrawer(o)}>
      <DrawerContent side="right" className="max-w-md bg-background" data-testid="cart-drawer">
        <DrawerHeader><DrawerTitle className="font-display text-h3">Your bag {lines.length > 0 && <span className="text-muted">({cartCount(lines)})</span>}</DrawerTitle></DrawerHeader>
        <DrawerBody className="flex-1">
          {lines.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-4 py-16 text-center">
              <ShoppingBag className="h-8 w-8 text-muted" aria-hidden="true" />
              <p className="font-display text-h4">Your bag is empty</p>
              <Link href="/collections" onClick={() => cart.openDrawer(false)} className="btn btn-outline btn-sm">Explore collections</Link>
            </div>
          ) : !q ? (
            <div className="flex flex-col gap-6">{lines.map((l) => <Skeleton key={lineKey(l)} className="h-28" />)}</div>
          ) : (
            <ul className="flex flex-col divide-y divide-border-subtle" data-testid="cart-lines">
              {q.lines.map((l) => {
                const key = lineKey(l);
                return (
                  <li key={key} className="flex gap-4 py-5">
                    <Link href={`/product/${l.slug}`} onClick={() => cart.openDrawer(false)} className="w-24 shrink-0"><ProgressiveImage src={l.image?.url} alt={l.image?.alt ?? l.name} ratio="aspect-[4/5]" /></Link>
                    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                      <div className="flex items-start justify-between gap-2">
                        <Link href={`/product/${l.slug}`} onClick={() => cart.openDrawer(false)} className="font-display text-h4 leading-snug">{l.name}</Link>
                        <button type="button" onClick={() => cart.remove(key)} aria-label={`Remove ${l.name}`} className="-mr-1 rounded-full p-1 text-muted hover:text-foreground"><X className="h-4 w-4" /></button>
                      </div>
                      {l.variantLabel && <span className="text-caption text-muted">Size {l.variantLabel}</span>}
                      <PriceTag price={l.unitPrice} size="sm" showLive={false} />
                      {l.notes.map((n) => <p key={n} className="text-caption text-warning">{n}</p>)}
                      {l.maxQuantity > 0 && (
                        <div className="mt-auto inline-flex w-fit items-center border border-border" role="group" aria-label={`Quantity of ${l.name}`}>
                          <button type="button" className="flex h-9 w-9 items-center justify-center hover:bg-surface-sunken" onClick={() => cart.setQuantity(key, l.quantity - 1)} aria-label="Decrease quantity"><Minus className="h-3.5 w-3.5" /></button>
                          <span className="tabular w-8 text-center text-body-sm" aria-live="polite">{l.quantity}</span>
                          <button type="button" className="flex h-9 w-9 items-center justify-center hover:bg-surface-sunken disabled:opacity-30" disabled={l.quantity >= l.maxQuantity} onClick={() => cart.setQuantity(key, l.quantity + 1)} aria-label="Increase quantity"><Plus className="h-3.5 w-3.5" /></button>
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </DrawerBody>
        {lines.length > 0 && (
          <DrawerFooter className="flex-col items-stretch gap-3 border-t border-border-subtle bg-background">
            <div className="flex items-baseline justify-between">
              <span className="text-body text-muted">{q?.totals.complete === false ? "Total (priced pieces)" : "Total"}</span>
              <span className="tabular font-display text-h3" data-testid="cart-total">{q ? formatMoney(q.totals.total) : "—"}</span>
            </div>
            <p className="text-caption text-muted">Inclusive of GST. Prices follow the gold rate and are confirmed at checkout.</p>
            <Link href="/checkout" onClick={() => cart.openDrawer(false)} className="btn btn-primary w-full" data-testid="drawer-checkout">Checkout</Link>
            <Link href="/cart" onClick={() => cart.openDrawer(false)} className="btn btn-outline w-full">View bag</Link>
          </DrawerFooter>
        )}
      </DrawerContent>
    </Drawer>
  );
}
