"use client";

import Link from "next/link";
import type { StoreProductCard } from "@jewellery/types";
import { cn } from "@jewellery/ui";
import { ProgressiveImage } from "../ui/progressive-image";
import { PriceTag } from "./price";
import { WishlistButton } from "./wishlist-button";

/**
 * The reusable product tile: image-forward, a second image on hover (desktop), quiet badges that are all true (New,
 * Only N left, Unavailable), and a price that is always the API's — live, or "Price on request".
 */
export function ProductCard({ product, priority, className }: { product: StoreProductCard; priority?: boolean; className?: string }) {
  const out = product.availability.status === "OUT_OF_STOCK";
  const badge = out ? "Unavailable" : product.availability.status === "LOW_STOCK" ? `Only ${product.availability.remaining} left` : product.isNew ? "New" : null;
  return (
    <article className={cn("group relative flex flex-col", className)} data-testid="product-card">
      <Link href={`/product/${product.slug}`} className="flex flex-col gap-4 focus-visible:outline-none" aria-label={`${product.name}${product.price.status === "AVAILABLE" ? "" : " — price on request"}`}>
        <div className="relative">
          <ProgressiveImage src={product.image?.url} alt={product.image?.alt ?? product.name} priority={priority} sizes="(min-width:1024px) 25vw, 50vw" className={cn("transition-shadow duration-300 group-focus-visible:ring-2 group-focus-visible:ring-ring", out && "opacity-70")} imgClassName="transition-transform duration-700 ease-out group-hover:scale-[1.03]" />
          {product.altImage && (
            <div className="pointer-events-none absolute inset-0 hidden opacity-0 transition-opacity duration-500 group-hover:opacity-100 md:block" aria-hidden="true">
              <ProgressiveImage src={product.altImage.url} alt="" className="h-full" ratio="h-full" />
            </div>
          )}
          {badge && <span className="absolute left-3 top-3 bg-surface px-2.5 py-1 text-[0.625rem] font-medium uppercase tracking-[0.16em] text-foreground">{badge}</span>}
        </div>
        <div className="flex flex-col gap-1.5">
          <h3 className="font-display text-[1.0625rem] leading-snug text-foreground">{product.name}</h3>
          <p className="text-caption text-muted">{[product.metal?.name, product.purity].filter(Boolean).join(" · ")}</p>
          <PriceTag price={product.price} size="sm" className="mt-0.5" />
        </div>
      </Link>
      <div className="absolute right-3 top-3"><WishlistButton slug={product.slug} name={product.name} /></div>
    </article>
  );
}

export function ProductGrid({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("grid grid-cols-2 gap-x-4 gap-y-10 sm:gap-x-6 lg:grid-cols-3 xl:grid-cols-4", className)}>{children}</div>;
}
