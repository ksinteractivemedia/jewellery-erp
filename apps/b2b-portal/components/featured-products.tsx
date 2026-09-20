"use client";

import { useRouter } from "next/navigation";
import { ProductGrid, ProductCard } from "@jewellery/ui";
import type { WholesaleProduct } from "../lib/placeholder-data";

export function FeaturedProducts({ products }: { products: WholesaleProduct[] }) {
  const router = useRouter();

  return (
    <ProductGrid>
      {products.map((product) => (
        <ProductCard
          key={product.id}
          name={product.name}
          image={product.image}
          purity={product.purity}
          price={product.price}
          badge={`MOQ ${product.moq}`}
          onClick={() => router.push(`/catalogue/${product.id}`)}
        />
      ))}
    </ProductGrid>
  );
}
