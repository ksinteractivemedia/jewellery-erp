"use client";

import { useRouter } from "next/navigation";
import { ProductCard, ProductGrid } from "@jewellery/ui";
import type { PlaceholderProduct } from "../lib/placeholder-data";
import { useStore } from "../lib/store-context";

export function FeaturedProducts({ products }: { products: PlaceholderProduct[] }) {
  const router = useRouter();
  const { toggleWishlist, wishlist } = useStore();

  return (
    <ProductGrid>
      {products.map((product) => (
        <ProductCard
          key={product.id}
          name={product.name}
          image={product.image}
          purity={product.purity}
          price={product.price}
          compareAtPrice={product.compareAtPrice}
          badge={product.badge}
          wishlisted={wishlist.has(product.id)}
          onWishlistToggle={() => toggleWishlist(product.id, product.name)}
          onClick={() => router.push(`/products/${product.id}`)}
        />
      ))}
    </ProductGrid>
  );
}
