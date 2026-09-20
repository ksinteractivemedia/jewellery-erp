import * as React from "react";
import { Minus, Plus, X } from "lucide-react";
import { cn } from "../lib/utils";
import { formatCurrency } from "../lib/format";
import { Drawer, DrawerBody, DrawerContent, DrawerFooter, DrawerHeader, DrawerTitle, DrawerTrigger } from "./drawer";
import { Button } from "./button";
import { EmptyState } from "./empty-state";

export interface CartLineItem {
  id: string;
  name: string;
  image: string;
  price: number;
  quantity: number;
  variant?: string;
}

export interface CartDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger?: React.ReactNode;
  items: CartLineItem[];
  subtotal: number;
  onQuantityChange: (id: string, quantity: number) => void;
  onRemove: (id: string) => void;
  onCheckout: () => void;
}

export function CartDrawer({ open, onOpenChange, trigger, items, subtotal, onQuantityChange, onRemove, onCheckout }: CartDrawerProps) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      {trigger && <DrawerTrigger asChild>{trigger}</DrawerTrigger>}
      <DrawerContent side="right">
        <DrawerHeader>
          <DrawerTitle>Your bag ({items.length})</DrawerTitle>
        </DrawerHeader>
        <DrawerBody>
          {items.length === 0 ? (
            <EmptyState title="Your bag is empty" description="Items you add will appear here." />
          ) : (
            <ul className="flex flex-col gap-4">
              {items.map((item) => (
                <li key={item.id} className="flex gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={item.image} alt={item.name} className="h-20 w-16 shrink-0 rounded-md object-cover" />
                  <div className="flex flex-1 flex-col gap-1">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-body-sm font-medium text-foreground">{item.name}</span>
                      <button
                        type="button"
                        aria-label={`Remove ${item.name}`}
                        onClick={() => onRemove(item.id)}
                        className="text-muted hover:text-danger"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    {item.variant && <span className="text-caption text-muted">{item.variant}</span>}
                    <div className="mt-auto flex items-center justify-between">
                      <div className="flex items-center gap-1 rounded-md border border-border">
                        <button
                          type="button"
                          aria-label="Decrease quantity"
                          onClick={() => onQuantityChange(item.id, Math.max(1, item.quantity - 1))}
                          className="flex h-7 w-7 items-center justify-center text-foreground hover:bg-surface-sunken"
                        >
                          <Minus className="h-3 w-3" />
                        </button>
                        <span className="w-6 text-center text-body-sm tabular">{item.quantity}</span>
                        <button
                          type="button"
                          aria-label="Increase quantity"
                          onClick={() => onQuantityChange(item.id, item.quantity + 1)}
                          className="flex h-7 w-7 items-center justify-center text-foreground hover:bg-surface-sunken"
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                      </div>
                      <span className="tabular text-body-sm font-medium text-foreground">
                        {formatCurrency(item.price * item.quantity)}
                      </span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </DrawerBody>
        {items.length > 0 && (
          <DrawerFooter className={cn("flex-col items-stretch gap-3")}>
            <div className="flex items-center justify-between text-body font-medium text-foreground">
              <span>Subtotal</span>
              <span className="tabular">{formatCurrency(subtotal)}</span>
            </div>
            <Button variant="primary" size="lg" onClick={onCheckout}>
              Checkout
            </Button>
          </DrawerFooter>
        )}
      </DrawerContent>
    </Drawer>
  );
}
