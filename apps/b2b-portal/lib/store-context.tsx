"use client";

import * as React from "react";
import { type CartLineItem, toast } from "@jewellery/ui";
import type { WholesaleProduct } from "./placeholder-data";

interface StoreContextValue {
  items: CartLineItem[];
  addItem: (product: WholesaleProduct) => void;
  removeItem: (id: string) => void;
  updateQuantity: (id: string, quantity: number) => void;
  subtotal: number;
  cartOpen: boolean;
  setCartOpen: (open: boolean) => void;
}

const StoreContext = React.createContext<StoreContextValue | null>(null);

/** Client-side purchase-list state only — UI polish, not the real PO/pricing workflow (Phase 4). */
export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<CartLineItem[]>([]);
  const [cartOpen, setCartOpen] = React.useState(false);

  const addItem = React.useCallback((product: WholesaleProduct) => {
    setItems((prev) => {
      const existing = prev.find((i) => i.id === product.id);
      if (existing) {
        return prev.map((i) => (i.id === product.id ? { ...i, quantity: i.quantity + product.moq } : i));
      }
      return [...prev, { id: product.id, name: product.name, image: product.image, price: product.price, quantity: product.moq, variant: `${product.purity} · MOQ ${product.moq}` }];
    });
    toast({ title: "Added to purchase list", description: `${product.name} × ${product.moq}`, variant: "success" });
    setCartOpen(true);
  }, []);

  const removeItem = React.useCallback((id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }, []);

  const updateQuantity = React.useCallback((id: string, quantity: number) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, quantity } : i)));
  }, []);

  const subtotal = items.reduce((sum, i) => sum + i.price * i.quantity, 0);

  return (
    <StoreContext.Provider value={{ items, addItem, removeItem, updateQuantity, subtotal, cartOpen, setCartOpen }}>
      {children}
    </StoreContext.Provider>
  );
}

export function useStore() {
  const ctx = React.useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}
