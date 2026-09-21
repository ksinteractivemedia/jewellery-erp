"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { StoreCartLineInput, StoreCartQuote, StoreContent, StoreListResult, StoreNavigation, StoreProductDetail, StoreReviewsSection } from "@jewellery/types";
import { storeGet, storePost } from "./api";

export const storeKeys = {
  content: ["store", "content"] as const,
  navigation: ["store", "navigation"] as const,
  products: (query: string) => ["store", "products", query] as const,
  product: (slug: string) => ["store", "product", slug] as const,
  quote: (lines: StoreCartLineInput[]) => ["store", "quote", lines] as const,
  reviews: ["store", "reviews"] as const,
};

/** The server renders the first view; these hooks take that as `initialData` and keep it fresh — a price is a moment in time, not a fixture. */
const PRICE_REFRESH_MS = 5 * 60_000;

export const useContent = (initial?: StoreContent) => useQuery({ queryKey: storeKeys.content, queryFn: () => storeGet<StoreContent>("/content"), initialData: initial, staleTime: 5 * 60_000 });
export const useNavigation = (initial?: StoreNavigation) => useQuery({ queryKey: storeKeys.navigation, queryFn: () => storeGet<StoreNavigation>("/navigation"), initialData: initial, staleTime: 5 * 60_000 });

export const useProducts = (query: string, opts: { initial?: StoreListResult; enabled?: boolean } = {}) =>
  useQuery({
    queryKey: storeKeys.products(query),
    queryFn: ({ signal }) => storeGet<StoreListResult>(`/products${query}`, { signal }),
    initialData: opts.initial,
    staleTime: 30_000,
    enabled: opts.enabled ?? true,
    placeholderData: keepPreviousData,
  });

export const useProduct = (slug: string, initial?: StoreProductDetail) =>
  useQuery({
    queryKey: storeKeys.product(slug),
    queryFn: async () => (await storeGet<{ product: StoreProductDetail }>(`/products/${slug}`)).product,
    initialData: initial,
    staleTime: 60_000,
    refetchInterval: PRICE_REFRESH_MS,
  });

/** The bag, priced by the server: what each line costs today, how many can be bought, and the total. */
export const useCartQuote = (lines: StoreCartLineInput[]) =>
  useQuery({
    queryKey: storeKeys.quote(lines),
    queryFn: () => storePost<StoreCartQuote>("/cart/quote", { lines }),
    enabled: lines.length > 0,
    staleTime: 30_000,
    refetchInterval: PRICE_REFRESH_MS,
    placeholderData: keepPreviousData,
  });

export const useReviews = () => useQuery({ queryKey: storeKeys.reviews, queryFn: () => storeGet<StoreReviewsSection>("/reviews"), staleTime: 10 * 60_000 });

/** Wishlisted designs, fetched by slug (the list itself lives on the device; what each piece costs today does not). */
export const useWishlistProducts = (slugs: string[]) =>
  useQuery({
    queryKey: ["store", "wishlist", slugs] as const,
    queryFn: () => storeGet<StoreListResult>(`/products?slugs=${slugs.join(",")}&pageSize=48`),
    enabled: slugs.length > 0,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });

/** Search-as-you-type suggestions: a handful of matches. */
export const useSuggestions = (q: string) =>
  useQuery({
    queryKey: ["store", "suggest", q] as const,
    queryFn: ({ signal }) => storeGet<StoreListResult>(`/products?q=${encodeURIComponent(q)}&pageSize=6`, { signal }),
    enabled: q.trim().length >= 2,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });
