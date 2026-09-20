"use client";

import * as React from "react";
import { type CartLineItem, toast } from "@jewellery/ui";
import type { PlaceholderProduct } from "./placeholder-data";

interface StoreContextValue {
  items: CartLineItem[];
  addItem: (product: PlaceholderProduct) => void;
  removeItem: (id: string) => void;
  updateQuantity: (id: string, quantity: number) => void;
  subtotal: number;
  cartOpen: boolean;
  setCartOpen: (open: boolean) => void;
  wishlist: Set<string>;
  toggleWishlist: (id: string, name: string) => void;
}

const StoreContext = React.createContext<StoreContextValue | null>(null);

/**
 * Client-side cart/wishlist state only — interaction polish for the shell, not a
 * pricing or inventory decision. Nothing here reserves stock or computes tax;
 * that belongs to the pricing engine + inventory ledger (see architecture.md).
 */
export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<CartLineItem[]>([]);
  const [cartOpen, setCartOpen] = React.useState(false);
  const [wishlist, setWishlist] = React.useState<Set<string>>(new Set());

  const addItem = React.useCallback((product: PlaceholderProduct) => {
    setItems((prev) => {
      const existing = prev.find((i) => i.id === product.id);
      if (existing) {
        return prev.map((i) => (i.id === product.id ? { ...i, quantity: i.quantity + 1 } : i));
      }
      return [...prev, { id: product.id, name: product.name, image: product.image, price: product.price, quantity: 1, variant: product.purity }];
    });
    toast({ title: "Added to bag", description: product.name, variant: "success" });
    setCartOpen(true);
  }, []);

  const removeItem = React.useCallback((id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }, []);

  const updateQuantity = React.useCallback((id: string, quantity: number) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, quantity } : i)));
  }, []);

  const toggleWishlist = React.useCallback(
    (id: string, name: string) => {
      // Decide before the state update, not inside the setState updater — an updater
      // can run during React's render phase, and calling toast() (another component's
      // setState) from there triggers a "setState while rendering" warning.
      const isAdding = !wishlist.has(id);
      setWishlist((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
      if (isAdding) {
        toast({ title: "Added to wishlist", description: name });
      }
    },
    [wishlist]
  );

  const subtotal = items.reduce((sum, i) => sum + i.price * i.quantity, 0);

  return (
    <StoreContext.Provider value={{ items, addItem, removeItem, updateQuantity, subtotal, cartOpen, setCartOpen, wishlist, toggleWishlist }}>
      {children}
    </StoreContext.Provider>
  );
}

export function useStore() {
  const ctx = React.useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}
