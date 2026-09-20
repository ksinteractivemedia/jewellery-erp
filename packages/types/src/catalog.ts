import type { Grams, Id } from "./common";
import type { ProductVariant } from "./product-variant";
import type { Product, ProductImage } from "./product";

/** An image as the API returns it: the stored reference plus a resolved, ready-to-render URL. */
export interface ProductImageView extends ProductImage {
  url: string;
}

export interface RefSummary {
  id: Id;
  name: string;
}

export interface MetalSummary {
  id: Id;
  code: string;
  name: string;
}

/** One row of the product list. Deliberately small — everything the table and its mobile cards need, nothing more. */
export interface ProductListItem {
  id: Id;
  sku: string;
  name: string;
  slug: string;
  isActive: boolean;
  b2cEnabled: boolean;
  b2bEnabled: boolean;
  metal?: MetalSummary;
  purity?: string;
  category?: RefSummary;
  collections: RefSummary[];
  tags: string[];
  primaryImageUrl?: string;
  imageCount: number;
  variantCount: number;
  updatedAt: Date;
}

export interface ProductListResult {
  items: ProductListItem[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * Physical stock for a product, shown on the detail page ONLY to callers who hold
 * `inventory.view`. It is a count of InventoryItems (physical pieces) that reference this
 * catalogue definition — the Product itself never holds a quantity.
 */
export interface ProductStockSummary {
  pieces: number;
  available: number;
}

export interface ProductDetail extends Omit<Product, "images"> {
  images: ProductImageView[];
  metal?: MetalSummary;
  category?: RefSummary;
  collections: RefSummary[];
  variants: ProductVariant[];
  stock?: ProductStockSummary;
  defaultGrossWeight?: Grams;
}

export interface CategoryNode {
  id: Id;
  name: string;
  slug: string;
  description?: string;
  parentId?: Id;
  isActive: boolean;
  /** Products directly in this category (not its descendants). */
  productCount: number;
}

export interface CollectionView {
  id: Id;
  name: string;
  slug: string;
  description?: string;
  isActive: boolean;
  productCount: number;
}

export interface BulkResult {
  matched: number;
  modified: number;
}

export interface MetalOption extends MetalSummary {
  /** Active purity codes for this metal, e.g. ["24K","22K","18K"] — drives the purity picker. */
  purities: string[];
}

/** Reference data the product list filters and the product form need, in one round trip. */
export interface CatalogMeta {
  metals: MetalOption[];
  /** Purities actually used by existing products (filter facet). */
  usedPurities: string[];
  tags: string[];
}
