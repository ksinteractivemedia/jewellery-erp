"use client";

import { Button } from "@jewellery/ui";
import type { PlaceholderProduct } from "../lib/placeholder-data";
import { useStore } from "../lib/store-context";

export function AddToBagButton({ product }: { product: PlaceholderProduct }) {
  const { addItem } = useStore();
  return (
    <Button variant="primary" size="lg" className="flex-1" onClick={() => addItem(product)}>
      Add to bag
    </Button>
  );
}
