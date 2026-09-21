import { cache } from "react";
import type { StoreContent, StoreNavigation } from "@jewellery/types";
import { storeGet } from "./api";

/** What the shell shows when it has no content: a neutral name and nothing else — no promises, no policies. */
export const EMPTY_CONTENT: StoreContent = { brandName: "Jewellery", announcements: [], trust: [], policies: {}, featured: { collectionSlugs: [], productSlugs: [] } };
export const EMPTY_NAVIGATION: StoreNavigation = { categories: [], collections: [] };

/** Per-request (deduplicated) reads for the shell. If the API is unreachable the shell still renders; each page then reports its own failure. */
export const getContent = cache(async (): Promise<StoreContent> => storeGet<StoreContent>("/content", { revalidate: 30 }).catch(() => EMPTY_CONTENT));
export const getNavigation = cache(async (): Promise<StoreNavigation> => storeGet<StoreNavigation>("/navigation", { revalidate: 30 }).catch(() => EMPTY_NAVIGATION));
