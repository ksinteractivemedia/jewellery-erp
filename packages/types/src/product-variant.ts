import type { Grams, Id, Timestamps } from "./common";

/**
 * A sellable variation of a Product (ring size, bangle size) with its own SKU. Variants
 * inherit the product's imagery and metal — they only differ in the attributes below.
 */
export interface ProductVariant extends Timestamps {
  id: Id;
  productId: Id;
  sku: string;
  /** e.g. { size: "14" } — deliberately open-ended, not every product varies the same way. */
  attributes: Record<string, string>;
  defaultGrossWeight?: Grams;
  defaultNetWeight?: Grams;
  isActive: boolean;
}
