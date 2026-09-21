"use client";

import Link from "next/link";
import { Heart } from "lucide-react";
import { Skeleton } from "@jewellery/ui";
import { useWishlistProducts } from "../../lib/queries";
import { useWishlist } from "../../lib/wishlist";
import { ProductCard, ProductGrid } from "./product-card";

/** Saved designs, with what each costs TODAY. The list lives on this device; prices and availability come from the API each visit. */
export function WishlistView() {
  const slugs = useWishlist();
  const result = useWishlistProducts(slugs);
  if (slugs.length === 0) {
    return (
      <div className="flex flex-col items-center gap-5 py-24 text-center" data-testid="wishlist-empty">
        <Heart className="h-10 w-10 text-muted" strokeWidth={1.25} aria-hidden="true" />
        <h2 className="font-display text-h2">Nothing saved yet</h2>
        <p className="max-w-sm text-body text-muted">Tap the heart on any piece to keep it here. Your wishlist is stored on this device, so you don’t need an account.</p>
        <Link href="/collections" className="btn btn-primary">Explore collections</Link>
      </div>
    );
  }
  if (result.isPending) return <ProductGrid>{slugs.slice(0, 8).map((s) => <Skeleton key={s} className="aspect-[4/5]" />)}</ProductGrid>;
  if (result.isError) return <div role="alert" className="flex flex-col items-center gap-4 border border-dashed border-border py-20 text-center"><p className="font-display text-h3">We couldn’t load your wishlist</p><button className="btn btn-outline btn-sm" onClick={() => result.refetch()}>Try again</button></div>;
  // Keep the shopper's own order (newest saved first); a saved piece that is no longer offered is reported, not silently dropped.
  const bySlug = new Map(result.data.items.map((p) => [p.slug, p]));
  const items = slugs.map((s) => bySlug.get(s)).filter((p): p is NonNullable<typeof p> => Boolean(p));
  const gone = slugs.length - items.length;
  return (
    <div className="flex flex-col gap-8" data-testid="wishlist">
      {gone > 0 && <p className="text-body-sm text-muted" role="status" data-testid="wishlist-gone">{gone} saved {gone === 1 ? "piece is" : "pieces are"} no longer available.</p>}
      <ProductGrid>{items.map((p) => <ProductCard key={p.id} product={p} />)}</ProductGrid>
    </div>
  );
}
