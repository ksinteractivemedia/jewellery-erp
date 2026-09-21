"use client";

import { useSyncExternalStore } from "react";
import { createPersistentStore } from "./persistent-store";

export function parseWishlist(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.filter((s): s is string => typeof s === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s)))].slice(0, 60);
}
export const toggleSlug = (slugs: string[], slug: string): string[] => (slugs.includes(slug) ? slugs.filter((s) => s !== slug) : [slug, ...slugs].slice(0, 60));

const store = createPersistentStore<string[]>({ key: "suvarna.wishlist.v1", empty: [], parse: parseWishlist });

export const wishlist = { toggle: (slug: string) => store.update((s) => toggleSlug(s, slug)), remove: (slug: string) => store.update((s) => s.filter((x) => x !== slug)) };
export const useWishlist = () => useSyncExternalStore(store.subscribe, store.get, store.getServer);
