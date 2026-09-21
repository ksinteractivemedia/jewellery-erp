import type { StoreSort } from "@jewellery/types";
import { STORE_SORTS } from "@jewellery/validation";
import { rupeesToPaise } from "./money";

/**
 * The state of a product grid — what the shopper has chosen — held in the URL so a filtered view can be shared, bookmarked
 * and reloaded. Prices are whole rupees in the URL (people read them) and paise in the API. The URL is untrusted input:
 * anything malformed falls back to a default rather than breaking the page.
 */
export interface ListingParams {
  sort: StoreSort;
  metal?: string;
  purity?: string;
  category?: string;
  minRupees?: number;
  maxRupees?: number;
  inStock: boolean;
  page: number;
}
export const DEFAULT_SORT: StoreSort = "newest";
export const PAGE_SIZE = 24;

type Raw = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const token = /^[A-Za-z0-9._ -]{1,20}$/;
const slug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const rupees = (v: string | undefined) => (rupeesToPaise(v) === undefined ? undefined : Number((v ?? "").replace(/[,\s₹]/g, "")));

export function parseListingParams(raw: Raw): ListingParams {
  const sort = one(raw.sort);
  const page = Number(one(raw.page));
  const metal = one(raw.metal);
  const purity = one(raw.purity);
  const category = one(raw.category);
  let minRupees = rupees(one(raw.min));
  let maxRupees = rupees(one(raw.max));
  if (minRupees !== undefined && maxRupees !== undefined && minRupees > maxRupees) [minRupees, maxRupees] = [maxRupees, minRupees];
  return {
    sort: (STORE_SORTS as readonly string[]).includes(sort ?? "") ? (sort as StoreSort) : DEFAULT_SORT,
    ...(metal && token.test(metal) ? { metal: metal.toUpperCase() } : {}),
    ...(purity && token.test(purity) ? { purity } : {}),
    ...(category && slug.test(category) ? { category } : {}),
    ...(minRupees !== undefined ? { minRupees } : {}),
    ...(maxRupees !== undefined ? { maxRupees } : {}),
    inStock: one(raw.inStock) === "1",
    page: Number.isInteger(page) && page >= 1 && page <= 1000 ? page : 1,
  };
}

/** The query string for the browser's address bar: defaults are left out, so a plain listing has a clean URL. */
export function toSearchString(p: ListingParams, extra: Record<string, string | undefined> = {}): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(extra)) if (v) qs.set(k, v);
  if (p.sort !== DEFAULT_SORT) qs.set("sort", p.sort);
  if (p.metal) qs.set("metal", p.metal);
  if (p.purity) qs.set("purity", p.purity);
  if (p.category) qs.set("category", p.category);
  if (p.minRupees !== undefined) qs.set("min", String(p.minRupees));
  if (p.maxRupees !== undefined) qs.set("max", String(p.maxRupees));
  if (p.inStock) qs.set("inStock", "1");
  if (p.page > 1) qs.set("page", String(p.page));
  const s = qs.toString();
  return s ? `?${s}` : "";
}

/** The API's query for a listing: the fixed scope of the page (a category, a collection, a search) plus what the shopper chose. */
export function toApiQuery(scope: { category?: string; collection?: string; q?: string }, p: ListingParams): string {
  const qs = new URLSearchParams();
  const category = p.category ?? scope.category;
  if (category) qs.set("category", category);
  if (scope.collection) qs.set("collection", scope.collection);
  if (scope.q) qs.set("q", scope.q);
  if (p.metal) qs.set("metal", p.metal);
  if (p.purity) qs.set("purity", p.purity);
  if (p.minRupees !== undefined) qs.set("minPrice", String(p.minRupees * 100));
  if (p.maxRupees !== undefined) qs.set("maxPrice", String(p.maxRupees * 100));
  if (p.inStock) qs.set("inStock", "true");
  qs.set("sort", p.sort);
  qs.set("page", String(p.page));
  qs.set("pageSize", String(PAGE_SIZE));
  return `?${qs.toString()}`;
}

export const hasActiveFilters = (p: ListingParams) => Boolean(p.metal || p.purity || p.category || p.minRupees !== undefined || p.maxRupees !== undefined || p.inStock);
export const clearFilters = (p: ListingParams): ListingParams => ({ sort: p.sort, inStock: false, page: 1 });
