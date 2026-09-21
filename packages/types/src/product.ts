import type { Grams, Id, Paise, StoneDetail, Timestamps } from "./common";

/** A stored image reference. `key` is an opaque storage key, never a URL — URLs are resolved per environment by the API. */
export interface ProductImage {
  key: string;
  alt?: string;
}

/**
 * Catalogue/design definition — never a physical piece (architecture.md §4). It has no
 * quantity, no weight-of-a-piece and no status of a piece: those belong to InventoryItem.
 * `isActive` says whether the *design* is offered at all; `b2cEnabled`/`b2bEnabled` say
 * which channels may show it.
 */
export interface Product extends Timestamps {
  id: Id;
  sku: string;
  name: string;
  slug: string;
  description?: string;
  categoryId?: Id;
  collectionIds: Id[];
  metalId: Id;
  purity?: string;
  /** Design guidance only — the real weights live on each InventoryItem. */
  defaultGrossWeight?: Grams;
  defaultNetWeight?: Grams;
  stoneDetails: StoneDetail[];
  /**
   * What the design's stones are priced at (integer paise), as merchandising sets it. The stones have no rate of their
   * own anywhere in the system, so without this a stone-set design cannot be priced honestly — the storefront then shows
   * "price on request" rather than a number that leaves the stones out.
   */
  stoneValue?: Paise;
  /** Ordered; the first image is the primary one. */
  images: ProductImage[];
  /** External video URLs (https). Videos are linked, not uploaded. */
  videos: string[];
  tags: string[];
  b2cEnabled: boolean;
  b2bEnabled: boolean;
  isActive: boolean;
  createdBy?: Id;
  updatedBy?: Id;
}
