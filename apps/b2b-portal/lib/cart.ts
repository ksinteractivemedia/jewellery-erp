"use client";

import { useSyncExternalStore } from "react";

/** A wholesale cart line: WHICH SKU and HOW MANY. Never a price — prices are the seller's, recalculated by the API each time. */
export interface CartLine { sku: string; quantity: number }

export function parseCart(raw: unknown): CartLine[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: CartLine[] = [];
  for (const item of raw) {
    const l = item as Partial<CartLine>;
    const sku = typeof l?.sku === "string" ? l.sku.trim().toUpperCase() : "";
    const quantity = Number.isInteger(l?.quantity) && (l.quantity as number) > 0 ? Math.min(l.quantity as number, 100_000) : 0;
    if (!sku || !quantity || seen.has(sku)) continue;
    seen.add(sku);
    out.push({ sku, quantity });
  }
  return out.slice(0, 200);
}
export function addToCart(lines: CartLine[], add: CartLine): CartLine[] {
  const sku = add.sku.trim().toUpperCase();
  return lines.some((l) => l.sku === sku) ? lines.map((l) => (l.sku === sku ? { ...l, quantity: Math.min(l.quantity + add.quantity, 100_000) } : l)) : [...lines, { sku, quantity: add.quantity }];
}
export const setQuantity = (lines: CartLine[], sku: string, quantity: number): CartLine[] => (quantity < 1 ? lines.filter((l) => l.sku !== sku) : lines.map((l) => (l.sku === sku ? { ...l, quantity: Math.min(quantity, 100_000) } : l)));
export const cartPieces = (lines: CartLine[]) => lines.reduce((s, l) => s + l.quantity, 0);

// One cart per signed-in buyer on this device, so two people sharing a browser never see each other's.
const listeners = new Set<() => void>();
let owner = "";
let current: CartLine[] = [];
const keyOf = (o: string) => `suvarna.b2b.cart.${o}`;
const read = (o: string): CartLine[] => {
  try { return parseCart(JSON.parse(window.localStorage.getItem(keyOf(o)) ?? "[]")); } catch { return []; }
};
const emit = () => listeners.forEach((l) => l());
export const cartStore = {
  use(userId: string) {
    if (owner !== userId && typeof window !== "undefined") { owner = userId; current = read(userId); }
  },
  set(lines: CartLine[]) {
    current = lines;
    try { window.localStorage.setItem(keyOf(owner), JSON.stringify(lines)); } catch { /* storage blocked: the cart still lives in memory for this tab */ }
    emit();
  },
  add: (line: CartLine) => cartStore.set(addToCart(current, line)),
  setQuantity: (sku: string, q: number) => cartStore.set(setQuantity(current, sku, q)),
  remove: (sku: string) => cartStore.set(current.filter((l) => l.sku !== sku)),
  clear: () => cartStore.set([]),
};
const EMPTY: CartLine[] = [];
export const useCart = () => useSyncExternalStore((f) => (listeners.add(f), () => void listeners.delete(f)), () => current, () => EMPTY);
