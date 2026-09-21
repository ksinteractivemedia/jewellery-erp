import { z } from "zod";
import { zSlug } from "./slug";

const zBool = z.preprocess((v) => (v === "true" || v === "1" ? true : v === "false" || v === "0" ? false : v), z.boolean());
const zCsv = <T extends z.ZodTypeAny>(item: T) => z.preprocess((v) => (typeof v === "string" ? v.split(",").map((x) => x.trim()).filter(Boolean) : v), z.array(item));

export const STORE_SORTS = ["newest", "price-asc", "price-desc", "bestselling"] as const;
export const STORE_MAX_PAGE_SIZE = 48;

/**
 * Query for `GET /api/store/products`. Prices are integer paise. Price filtering and sorting apply to the LIVE computed
 * price, and a product priced on request has no price to compare — so it is left out of a price-bounded result and
 * sorted after every priced product in a price sort.
 */
export const storeListQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  category: zSlug.optional(),
  collection: zSlug.optional(),
  metal: z.string().trim().toUpperCase().max(20).optional(),
  purity: z.string().trim().max(20).optional(),
  minPrice: z.coerce.number().int().min(0).max(1_000_000_000_000).optional(),
  maxPrice: z.coerce.number().int().min(0).max(1_000_000_000_000).optional(),
  inStock: zBool.optional(),
  sort: z.enum(STORE_SORTS).default("newest"),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  pageSize: z.coerce.number().int().min(1).max(STORE_MAX_PAGE_SIZE).default(24),
  /** Specific products by slug — the wishlist. */
  slugs: zCsv(zSlug).pipe(z.array(zSlug).max(60)).optional(),
}).refine((q) => q.minPrice === undefined || q.maxPrice === undefined || q.minPrice <= q.maxPrice, { message: "minPrice must not exceed maxPrice", path: ["minPrice"] });
export type StoreListQuery = z.output<typeof storeListQuerySchema>;

export const STORE_MAX_LINE_QUANTITY = 10;
export const storeCartQuoteSchema = z.object({
  lines: z
    .array(z.object({ slug: zSlug, variantSku: z.string().trim().toUpperCase().max(60).optional(), quantity: z.number().int().min(1).max(STORE_MAX_LINE_QUANTITY) }))
    .min(1)
    .max(30),
});
export type StoreCartQuoteInput = z.input<typeof storeCartQuoteSchema>;

export const newsletterSchema = z.object({ email: z.string().trim().toLowerCase().email().max(254) });

const text = (max: number) => z.string().trim().min(1).max(max);
/** The editorial content document. Everything is optional except the brand name: an unwritten section is simply not shown. */
export const storefrontContentSchema = z.object({
  brandName: text(60),
  tagline: text(160).optional(),
  announcements: z.array(z.object({ text: text(160), href: z.string().trim().max(200).optional() })).max(5).default([]),
  hero: z.object({ eyebrow: text(60).optional(), title: text(120), subtitle: text(300).optional(), ctaLabel: text(40).optional(), ctaHref: z.string().trim().max(200).optional(), imageUrl: z.string().trim().url().optional() }).optional(),
  story: z.object({ eyebrow: text(60).optional(), title: text(120), body: z.array(text(600)).min(1).max(6), ctaLabel: text(40).optional(), ctaHref: z.string().trim().max(200).optional() }).optional(),
  trust: z.array(z.object({ icon: z.enum(["hallmark", "shipping", "returns", "secure", "certified", "support"]), title: text(60), text: text(200).optional() })).max(6).default([]),
  policies: z.object({ shipping: text(2000).optional(), returns: text(2000).optional(), care: text(2000).optional(), delivery: text(300).optional() }).default({}),
  featured: z.object({ collectionSlugs: z.array(zSlug).max(8).default([]), productSlugs: z.array(zSlug).max(12).default([]) }).default({}),
  /** The HSN code jewellery is taxed under on the storefront (per-product HSN is not modelled yet). */
  pricing: z.object({ hsnCode: z.string().regex(/^\d{4,8}$/) }).optional(),
  contact: z.object({ email: z.string().email().optional(), phone: z.string().trim().max(30).optional() }).optional(),
  /** Delivery options and their fees (integer paise, inclusive of any tax). */
  deliveryOptions: z.array(z.object({ code: z.string().trim().regex(/^[a-z0-9-]{2,30}$/), label: text(60), fee: z.number().int().min(0).max(10_000_000), estimate: text(120).optional() })).max(5).default([]),
});
export type StorefrontContentInput = z.input<typeof storefrontContentSchema>;

/**
 * Contact and delivery details for a storefront order. Validated in the browser for immediate feedback and, when orders
 * exist, again by the API — the same schema, so the two can never disagree about what a valid address is.
 */
export const storeCheckoutDetailsSchema = z.object({
  fullName: z.string().trim().min(2, "Enter your full name").max(80),
  email: z.string().trim().toLowerCase().email("Enter a valid email address").max(254),
  phone: z.string().trim().transform((v) => v.replace(/[\s-]/g, "").replace(/^(\+91|91|0)(?=\d{10}$)/, "")).pipe(z.string().regex(/^[6-9]\d{9}$/, "Enter a 10-digit Indian mobile number")),
  addressLine1: z.string().trim().min(3, "Enter your street address").max(120),
  addressLine2: z.string().trim().max(120).optional(),
  city: z.string().trim().min(2, "Enter your city").max(60),
  state: z.string().trim().min(2, "Enter your state").max(60),
  postalCode: z.string().trim().regex(/^[1-9]\d{5}$/, "Enter a 6-digit PIN code"),
});
export type StoreCheckoutDetails = z.output<typeof storeCheckoutDetailsSchema>;
export type StoreCheckoutDetailsInput = z.input<typeof storeCheckoutDetailsSchema>;
