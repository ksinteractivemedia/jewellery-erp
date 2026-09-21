import type { Grams, Id, Paise } from "./common";

/**
 * The public storefront's API contract (`/api/store/*`). Everything here is safe for an anonymous shopper:
 * no cost, no margin, no stock quantities beyond "in stock / a few left", no rule ids, no other channel's data.
 *
 * PRICES ARE DYNAMIC. A jewellery price is a calculation — today's metal rate × weight, plus making, stones and GST —
 * so the API never returns a bare "price" number. It returns a `StorePrice`: either a computed breakdown that says
 * when it was computed and against which rate, or an explicit `ON_REQUEST` with the reason. A client must not present
 * an `AVAILABLE` price as fixed, and must never invent one for `ON_REQUEST`.
 */
export interface StorePriceBreakdown {
  /** Net weight × today's rate for this purity. */
  metalValue: Paise;
  /** Wastage, when the pricing rules charge it. */
  wastage: Paise;
  makingCharges: Paise;
  stoneValue: Paise;
  discount: Paise;
  /** Everything above, less the discount, before GST. */
  taxableValue: Paise;
  gst: Paise;
  /** What the shopper pays, GST included. */
  total: Paise;
}

export type StorePriceUnavailableReason = "NO_WEIGHT" | "STONE_VALUE_MISSING" | "NO_METAL_RATE" | "PRICING_NOT_CONFIGURED";

export type StorePrice =
  | {
      status: "AVAILABLE";
      dynamic: true;
      total: Paise;
      breakdown: StorePriceBreakdown;
      /** What the price is computed from. */
      basis: {
        grossWeight: Grams;
        netWeight: Grams;
        metalName: string;
        purity: string;
        /** Today's rate for this purity, per gram (derived from another purity's quote when none is quoted for it). */
        ratePerGram: Paise;
        rateEffectiveFrom: string;
      };
      computedAt: string;
    }
  | { status: "ON_REQUEST"; reason: StorePriceUnavailableReason; message: string };

export type StoreAvailabilityStatus = "IN_STOCK" | "LOW_STOCK" | "OUT_OF_STOCK";
export interface StoreAvailability {
  status: StoreAvailabilityStatus;
  /** Only present for LOW_STOCK — the real number of pieces left. */
  remaining?: number;
  /** True when every available piece carries a HUID (hallmark unique ID), from the stock records — not a blanket claim. */
  hallmarked: boolean;
}

export interface StoreImage {
  url: string;
  alt: string;
}

export interface StoreProductCard {
  id: Id;
  slug: string;
  name: string;
  image?: StoreImage;
  /** A second image for a hover swap on desktop. */
  altImage?: StoreImage;
  metal?: { code: string; name: string };
  purity?: string;
  category?: { name: string; slug: string };
  price: StorePrice;
  availability: StoreAvailability;
  /** Added to the catalogue within the last 30 days. */
  isNew: boolean;
}

export interface StoreStone {
  name: string;
  caratWeight: number;
  quantity: number;
  quality?: string;
}

export interface StoreVariant {
  sku: string;
  attributes: Record<string, string>;
  price: StorePrice;
  availability: StoreAvailability;
}

export interface StoreProductDetail extends StoreProductCard {
  sku: string;
  description?: string;
  images: StoreImage[];
  collections: { name: string; slug: string }[];
  categoryTrail: { name: string; slug: string }[];
  variants: StoreVariant[];
  specs: {
    grossWeight?: Grams;
    netWeight?: Grams;
    stoneWeight?: Grams;
    stones: StoreStone[];
  };
  tags: string[];
  updatedAt: string;
}

export type StoreSort = "newest" | "price-asc" | "price-desc" | "bestselling";

export interface StoreFacets {
  metals: { code: string; name: string }[];
  purities: string[];
  categories: { name: string; slug: string; count: number; parentSlug?: string }[];
  /** Lowest and highest AVAILABLE price in the current scope, in paise — null when nothing in scope has a price. */
  price: { min: Paise; max: Paise } | null;
}

export interface StoreListResult {
  items: StoreProductCard[];
  total: number;
  page: number;
  pageSize: number;
  facets: StoreFacets;
}

export interface StoreCategoryNode {
  id: Id;
  name: string;
  slug: string;
  description?: string;
  parentSlug?: string;
  productCount: number;
  image?: StoreImage;
}
export interface StoreCollectionNode {
  id: Id;
  name: string;
  slug: string;
  description?: string;
  productCount: number;
  image?: StoreImage;
}
export interface StoreNavigation {
  categories: StoreCategoryNode[];
  collections: StoreCollectionNode[];
}

// ---- editorial content -------------------------------------------------------------------------
/**
 * Words and curation are DATA, not code (stored in `StorefrontContent`, edited by merchandising), and every
 * field is optional: a section with no content simply isn't rendered, so the storefront never displays a policy,
 * promise or story nobody has written. Development seeds sample copy so the layout can be exercised.
 */
export interface StoreContent {
  brandName: string;
  tagline?: string;
  announcements: { text: string; href?: string }[];
  hero?: { eyebrow?: string; title: string; subtitle?: string; ctaLabel?: string; ctaHref?: string; imageUrl?: string };
  story?: { eyebrow?: string; title: string; body: string[]; ctaLabel?: string; ctaHref?: string };
  trust: { icon: "hallmark" | "shipping" | "returns" | "secure" | "certified" | "support"; title: string; text?: string }[];
  policies: { shipping?: string; returns?: string; care?: string; delivery?: string };
  featured: { collectionSlugs: string[]; productSlugs: string[] };
  contact?: { email?: string; phone?: string };
  /** How an order can be delivered and what that costs — the business's own terms. Without any, checkout cannot be completed. */
  deliveryOptions?: { code: string; label: string; fee: Paise; estimate?: string }[];
}

export interface StoreHome {
  content: StoreContent;
  collections: StoreCollectionNode[];
  categories: StoreCategoryNode[];
  featured: StoreProductCard[];
  newArrivals: StoreProductCard[];
  bestsellers: StoreProductCard[];
}

// ---- cart --------------------------------------------------------------------------------------
export interface StoreCartLineInput {
  slug: string;
  variantSku?: string;
  quantity: number;
}
export interface StoreCartLine {
  slug: string;
  variantSku?: string;
  name: string;
  image?: StoreImage;
  variantLabel?: string;
  quantity: number;
  /** The most the shopper can buy right now (pieces available, capped). */
  maxQuantity: number;
  unitPrice: StorePrice;
  /** Unit total × quantity, when the line is priced. */
  lineTotal: Paise | null;
  availability: StoreAvailability;
  /** Things the shopper should know about this line ("Only 1 left — quantity reduced"). */
  notes: string[];
}
export interface StoreCartQuote {
  lines: StoreCartLine[];
  /** Totals over the priced lines. `complete` is false when a line is priced on request, so the total is not the full amount. */
  totals: { taxableValue: Paise; gst: Paise; total: Paise; complete: boolean };
  quotedAt: string;
}

export type StoreReviewsSection = { status: "NOT_CONNECTED"; requires: string };
