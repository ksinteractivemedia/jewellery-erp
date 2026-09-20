import type { Grams, Id, Timestamps } from "./common";

/** A sellable variation of a Product (e.g. ring size, bangle size) with its own SKU. */
export interface ProductVariant extends Timestamps {
  id: Id;
  productId: Id;
  sku: string;
  /** e.g. { size: "14", color: "rose-gold" } — deliberately open-ended, not every product varies the same way. */
  attributes: Record<string, string>;
  defaultGrossWeight?: Grams;
  defaultNetWeight?: Grams;
  images: string[];
  isActive: boolean;
}
