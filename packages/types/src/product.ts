import type { Channel, Grams, Id, StoneDetail, Timestamps } from "./common";

export type ProductStatus = "DRAFT" | "ACTIVE" | "DISCONTINUED";
export type ChannelVisibility = Channel | "BOTH";

/** Catalogue/design definition — never a physical piece. See architecture.md §4. */
export interface Product extends Timestamps {
  id: Id;
  sku: string;
  name: string;
  description?: string;
  images: string[];
  categoryId?: Id;
  metalId: Id;
  /** Design guidance only — actual values live on InventoryItem. */
  defaultPurity?: string;
  defaultGrossWeight?: Grams;
  defaultNetWeight?: Grams;
  stoneDetails: StoneDetail[];
  status: ProductStatus;
  channelVisibility: ChannelVisibility;
  hasVariants: boolean;
}
