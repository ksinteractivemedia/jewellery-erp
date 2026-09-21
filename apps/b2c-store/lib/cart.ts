"use client";

import { useSyncExternalStore } from "react";
import type { StoreCartLineInput } from "@jewellery/types";
import { STORE_MAX_LINE_QUANTITY } from "@jewellery/validation";
import { createPersistentStore } from "./persistent-store";

/** A line in the bag: WHAT and HOW MANY. Never a price — the price of a piece changes with the gold rate and comes from the API each time. */
export type CartLine = StoreCartLineInput;

export const lineKey = (l: { slug: string; variantSku?: string }) => `${l.slug}::${l.variantSku ?? ""}`;

// ---- pure operations (tested) ---------------------------------------------------------------------
export function parseCart(raw: unknown): CartLine[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const lines: CartLine[] = [];
  for (const item of raw) {
    const l = item as Partial<CartLine>;
    if (typeof l?.slug !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(l.slug)) continue;
    const variantSku = typeof l.variantSku === "string" && l.variantSku ? l.variantSku : undefined;
    const quantity = Number.isInteger(l.quantity) ? Math.min(Math.max(l.quantity as number, 1), STORE_MAX_LINE_QUANTITY) : 1;
    const line = { slug: l.slug, ...(variantSku ? { variantSku } : {}), quantity };
    if (!seen.has(lineKey(line))) (seen.add(lineKey(line)), lines.push(line));
  }
  return lines.slice(0, 30);
}
export function addLine(lines: CartLine[], add: { slug: string; variantSku?: string; quantity?: number }): CartLine[] {
  const key = lineKey(add);
  const qty = add.quantity ?? 1;
  const existing = lines.find((l) => lineKey(l) === key);
  if (existing) return lines.map((l) => (lineKey(l) === key ? { ...l, quantity: Math.min(l.quantity + qty, STORE_MAX_LINE_QUANTITY) } : l));
  return [...lines, { slug: add.slug, ...(add.variantSku ? { variantSku: add.variantSku } : {}), quantity: Math.min(qty, STORE_MAX_LINE_QUANTITY) }].slice(0, 30);
}
export const setLineQuantity = (lines: CartLine[], key: string, quantity: number): CartLine[] =>
  quantity < 1 ? lines.filter((l) => lineKey(l) !== key) : lines.map((l) => (lineKey(l) === key ? { ...l, quantity: Math.min(quantity, STORE_MAX_LINE_QUANTITY) } : l));
export const removeLine = (lines: CartLine[], key: string): CartLine[] => lines.filter((l) => lineKey(l) !== key);
export const cartCount = (lines: CartLine[]) => lines.reduce((n, l) => n + l.quantity, 0);

// ---- the store ----------------------------------------------------------------------------------
const store = createPersistentStore<CartLine[]>({ key: "suvarna.bag.v1", empty: [], parse: parseCart });
const drawer = { open: false, listeners: new Set<() => void>() };

export const cart = {
  add: (line: { slug: string; variantSku?: string; quantity?: number }) => store.update((l) => addLine(l, line)),
  setQuantity: (key: string, quantity: number) => store.update((l) => setLineQuantity(l, key, quantity)),
  remove: (key: string) => store.update((l) => removeLine(l, key)),
  clear: () => store.set([]),
  openDrawer: (open = true) => ((drawer.open = open), drawer.listeners.forEach((f) => f())),
};

export const useCartLines = () => useSyncExternalStore(store.subscribe, store.get, store.getServer);
export const useCartDrawerOpen = () =>
  useSyncExternalStore((f) => (drawer.listeners.add(f), () => void drawer.listeners.delete(f)), () => drawer.open, () => false);
