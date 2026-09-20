"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ClipboardList, Menu, Search, ShoppingBag, UserCircle } from "lucide-react";
import {
  Badge,
  Button,
  CartDrawer,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  formatCurrency,
} from "@jewellery/ui";
import { CATALOGUE_LINKS, PLACEHOLDER_COMPANY } from "../lib/placeholder-data";
import { useStore } from "../lib/store-context";
import { SearchDialog } from "./search-dialog";

export function WholesaleHeader() {
  const router = useRouter();
  const [searchOpen, setSearchOpen] = React.useState(false);
  const { items, subtotal, cartOpen, setCartOpen, removeItem, updateQuantity } = useStore();
  const available = PLACEHOLDER_COMPANY.creditLimit - PLACEHOLDER_COMPANY.outstanding;

  return (
    <>
      {/* Business context strip — ties every page back to who is ordering and their standing */}
      <div className="flex items-center justify-between gap-4 bg-[var(--palette-charcoal)] px-4 py-1.5 text-caption text-white/90 sm:px-6">
        <span className="truncate">
          Ordering as <span className="font-medium text-white">{PLACEHOLDER_COMPANY.name}</span>
          <span className="hidden sm:inline"> · GSTIN {PLACEHOLDER_COMPANY.gstin}</span>
        </span>
        <span className="shrink-0">
          Available credit <span className="font-medium text-white">{formatCurrency(available)}</span>
        </span>
      </div>

      <header className="sticky top-0 z-30 border-b border-border-subtle bg-surface">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6">
          <button type="button" aria-label="Open menu" className="flex h-9 w-9 items-center justify-center rounded-md text-foreground hover:bg-surface-sunken lg:hidden">
            <Menu className="h-5 w-5" />
          </button>
          <Link href="/" className="font-display text-h4 text-foreground">
            Suvarna <span className="text-muted">Wholesale</span>
          </Link>
          <nav aria-label="Catalogue" className="hidden flex-1 items-center justify-center gap-6 lg:flex">
            {CATALOGUE_LINKS.map((link) => (
              <Link key={link.href} href={link.href} className="text-body-sm text-foreground hover:text-primary">
                {link.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-1">
            <Button variant="ghost" size="icon" aria-label="Search" onClick={() => setSearchOpen(true)}>
              <Search className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" aria-label="Quotations" onClick={() => router.push("/account/quotations")}>
              <ClipboardList className="h-4 w-4" />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Account menu">
                  <UserCircle className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                <DropdownMenuLabel>
                  <span className="flex flex-col">
                    <span className="text-body-sm font-medium text-foreground">{PLACEHOLDER_COMPANY.contactName}</span>
                    <span className="text-caption font-normal text-muted">{PLACEHOLDER_COMPANY.name}</span>
                  </span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => router.push("/account/orders")}>Order history</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => router.push("/account/quotations")}>Quotations</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => router.push("/account/credit")}>Credit &amp; outstanding</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem destructive>Sign out</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="ghost" size="icon" aria-label={`Purchase list, ${items.length} items`} className="relative" onClick={() => setCartOpen(true)}>
              <ShoppingBag className="h-4 w-4" />
              {items.length > 0 && (
                <Badge variant="primary" className="absolute -right-1 -top-1 h-4 min-w-4 justify-center px-1 py-0 text-[10px]">
                  {items.length}
                </Badge>
              )}
            </Button>
          </div>
        </div>
      </header>

      <SearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
      <CartDrawer
        open={cartOpen}
        onOpenChange={setCartOpen}
        items={items}
        subtotal={subtotal}
        onQuantityChange={updateQuantity}
        onRemove={removeItem}
        onCheckout={() => router.push("/purchase-order-review")}
        title={(count) => `Purchase list (${count})`}
        checkoutLabel="Review purchase order"
        emptyTitle="Your purchase list is empty"
        emptyDescription="Add products from the catalogue to build a purchase order."
      />
    </>
  );
}
