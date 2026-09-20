"use client";

import { useRouter } from "next/navigation";
import { EmptyState, ProductCard, ProductGrid } from "@jewellery/ui";
import { FEATURED_PRODUCTS } from "../../lib/placeholder-data";
import { useStore } from "../../lib/store-context";

export default function WishlistPage() {
  const router = useRouter();
  const { wishlist, toggleWishlist } = useStore();
  const items = FEATURED_PRODUCTS.filter((p) => wishlist.has(p.id));

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <h1 className="mb-6 font-display text-h1">Wishlist</h1>
      {items.length === 0 ? (
        <EmptyState title="Your wishlist is empty" description="Tap the heart on any product to save it here." />
      ) : (
        <ProductGrid>
          {items.map((product) => (
            <ProductCard
              key={product.id}
              name={product.name}
              image={product.image}
              purity={product.purity}
              price={product.price}
              compareAtPrice={product.compareAtPrice}
              wishlisted
              onWishlistToggle={() => toggleWishlist(product.id, product.name)}
              onClick={() => router.push(`/products/${product.id}`)}
            />
          ))}
        </ProductGrid>
      )}
    </div>
  );
}
