"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Mail, Phone, Truck } from "lucide-react";
import type { StoreProductDetail } from "@jewellery/types";
import { cn, toast } from "@jewellery/ui";
import { cart } from "../../lib/cart";
import { useContent, useProduct } from "../../lib/queries";
import { AvailabilityBadge } from "./availability";
import { PriceBreakdown } from "./price-breakdown";
import { PriceNote, PriceTag } from "./price";
import { WishlistButton } from "./wishlist-button";

const variantLabel = (attributes: Record<string, string>) => Object.values(attributes).join(" · ");

/**
 * Everything a shopper decides on the product page: the LIVE price and how it is built, which size, whether it can be
 * bought, and the actions. Data comes from the server render and is then kept fresh — the price is re-read on focus and
 * every few minutes, because it is a calculation against a moving rate, not a label.
 */
export function PurchasePanel({ initial }: { initial: StoreProductDetail }) {
  const router = useRouter();
  const product = useProduct(initial.slug, initial).data ?? initial;
  const content = useContent().data;
  const [chosen, setChosen] = React.useState<string | undefined>(() => (initial.variants.find((v) => v.availability.status !== "OUT_OF_STOCK") ?? initial.variants[0])?.sku);
  const variant = product.variants.find((v) => v.sku === chosen);
  const price = variant?.price ?? product.price;
  const availability = variant?.availability ?? product.availability;
  const canBuy = price.status === "AVAILABLE" && availability.status !== "OUT_OF_STOCK";

  const add = () => {
    cart.add({ slug: product.slug, ...(variant ? { variantSku: variant.sku } : {}) });
    toast({ title: "Added to your bag", description: product.name, variant: "success" });
    cart.openDrawer();
  };
  const buyNow = () => {
    cart.add({ slug: product.slug, ...(variant ? { variantSku: variant.sku } : {}) });
    router.push("/checkout");
  };

  // The sticky bar (phone) appears once the real buttons have scrolled away.
  const actions = React.useRef<HTMLDivElement>(null);
  const [showBar, setShowBar] = React.useState(false);
  React.useEffect(() => {
    const el = actions.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([entry]) => setShowBar(!entry!.isIntersecting && entry!.boundingClientRect.top < 0), { threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const contact = content?.contact;
  return (
    <div className="flex flex-col gap-6" data-testid="purchase-panel">
      <header className="flex flex-col gap-3">
        {product.category && <Link href={`/category/${product.category.slug}`} className="eyebrow hover:text-foreground">{product.category.name}</Link>}
        <h1 className="heading-display text-h1 sm:text-display" data-testid="product-title">{product.name}</h1>
        <p className="text-caption text-muted" data-testid="product-sku">SKU {variant?.sku ?? product.sku}</p>
      </header>

      <div className="flex flex-col gap-2">
        <PriceTag price={price} size="lg" />
        <PriceNote price={price} />
      </div>

      {product.variants.length > 0 && (
        <fieldset className="flex flex-col gap-3">
          <legend className="text-[0.75rem] font-medium uppercase tracking-[0.14em]">Size</legend>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Size">
            {product.variants.map((v) => {
              const out = v.availability.status === "OUT_OF_STOCK";
              return (
                <button key={v.sku} type="button" role="radio" aria-checked={v.sku === chosen} onClick={() => setChosen(v.sku)} className={cn("relative h-11 min-w-12 border px-4 text-body-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", v.sku === chosen ? "border-foreground bg-foreground text-background" : "border-border hover:border-foreground", out && v.sku !== chosen && "text-muted line-through decoration-muted/50")} data-testid={`variant-${v.sku}`} title={out ? "Currently unavailable" : undefined}>
                  {variantLabel(v.attributes) || v.sku}
                </button>
              );
            })}
          </div>
        </fieldset>
      )}

      <div className="flex flex-col gap-4">
        <AvailabilityBadge availability={availability} />
        {content?.policies.delivery && <p className="flex items-center gap-2 text-body-sm text-muted" data-testid="delivery-estimate"><Truck className="h-4 w-4 shrink-0" aria-hidden="true" />{content.policies.delivery}</p>}
      </div>

      <div ref={actions} className="flex flex-col gap-3" data-testid="purchase-actions">
        {price.status === "ON_REQUEST" ? (
          <div className="flex flex-col gap-3 border border-border p-5" data-testid="on-request-box">
            <p className="text-body font-medium">This piece is priced individually.</p>
            <p className="text-body-sm text-muted">{price.message}</p>
            {(contact?.email || contact?.phone) ? (
              <div className="flex flex-wrap gap-3">
                {contact.email && <a href={`mailto:${contact.email}?subject=${encodeURIComponent(`Price enquiry — ${product.name} (${product.sku})`)}`} className="btn btn-dark btn-sm"><Mail className="h-4 w-4" aria-hidden="true" />Email us about it</a>}
                {contact.phone && <a href={`tel:${contact.phone.replace(/\s/g, "")}`} className="btn btn-outline btn-sm"><Phone className="h-4 w-4" aria-hidden="true" />Call</a>}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <button type="button" className="btn btn-primary" disabled={!canBuy} onClick={add} data-testid="add-to-bag">{availability.status === "OUT_OF_STOCK" ? "Currently unavailable" : "Add to bag"}</button>
            <button type="button" className="btn btn-dark" disabled={!canBuy} onClick={buyNow} data-testid="buy-now">Buy now</button>
          </div>
        )}
        <WishlistButton slug={product.slug} name={product.name} withLabel className="w-full justify-center" />
      </div>

      <PriceBreakdown price={price} />

      {showBar && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur lg:hidden rise" data-testid="sticky-buy-bar">
          <div className="flex items-center gap-4">
            <div className="flex min-w-0 flex-1 flex-col"><span className="truncate text-caption text-muted">{product.name}</span><PriceTag price={price} size="sm" /></div>
            {price.status === "AVAILABLE" ? (
              <button type="button" className="btn btn-primary shrink-0 px-6" disabled={!canBuy} onClick={add} data-testid="sticky-add">{canBuy ? "Add to bag" : "Unavailable"}</button>
            ) : (
              <button type="button" className="btn btn-outline shrink-0 px-6" onClick={() => actions.current?.scrollIntoView({ behavior: "smooth", block: "center" })}>Enquire</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
