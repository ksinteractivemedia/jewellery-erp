"use client";

import { Button } from "@jewellery/ui";
import type { WholesaleProduct } from "../lib/placeholder-data";
import { useStore } from "../lib/store-context";

export function AddToListButton({ product }: { product: WholesaleProduct }) {
  const { addItem } = useStore();
  return (
    <Button variant="primary" size="lg" className="flex-1" onClick={() => addItem(product)}>
      Add {product.moq} to purchase list
    </Button>
  );
}
