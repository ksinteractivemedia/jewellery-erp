"use client";

import Link from "next/link";
import { ChevronDown, Heart, Search, ShoppingBag, User } from "lucide-react";
import type { StoreNavigation } from "@jewellery/types";
import { Drawer, DrawerBody, DrawerContent, DrawerHeader, DrawerTitle } from "@jewellery/ui";

/** The phone menu: a full-height drawer with the real categories (sub-categories fold open) and collections, and the shopper's own places at the foot. */
export function MobileNav({ open, onOpenChange, navigation, onSearch }: { open: boolean; onOpenChange: (o: boolean) => void; navigation: StoreNavigation; onSearch: () => void }) {
  const top = navigation.categories.filter((c) => !c.parentSlug);
  const row = "flex min-h-12 items-center justify-between border-b border-border-subtle font-display text-h4 text-foreground";
  const small = "flex min-h-11 items-center gap-3 text-body text-foreground";
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent side="left" className="max-w-[88vw] bg-background" data-testid="mobile-nav">
        <DrawerHeader><DrawerTitle className="eyebrow">Menu</DrawerTitle></DrawerHeader>
        <DrawerBody className="flex flex-col gap-8 pb-10">
          <button type="button" onClick={onSearch} className="flex h-12 items-center gap-3 border border-border px-4 text-body text-muted"><Search className="h-4 w-4" aria-hidden="true" />Search jewellery</button>
          <nav aria-label="Categories" className="flex flex-col">
            <span className="eyebrow mb-1">Shop</span>
            {top.map((c) => {
              const kids = navigation.categories.filter((s) => s.parentSlug === c.slug);
              return kids.length ? (
                <details key={c.slug} className="group">
                  <summary className={`${row} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}>{c.name}<ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" aria-hidden="true" /></summary>
                  <ul className="flex flex-col gap-1 py-3 pl-3">
                    <li><Link href={`/category/${c.slug}`} className="flex min-h-11 items-center text-body text-foreground">All {c.name.toLowerCase()}</Link></li>
                    {kids.map((k) => <li key={k.slug}><Link href={`/category/${k.slug}`} className="flex min-h-11 items-center text-body text-muted">{k.name}</Link></li>)}
                  </ul>
                </details>
              ) : (
                <Link key={c.slug} href={`/category/${c.slug}`} className={row}>{c.name}</Link>
              );
            })}
          </nav>
          {navigation.collections.length > 0 && (
            <nav aria-label="Collections" className="flex flex-col">
              <span className="eyebrow mb-1">Collections</span>
              {navigation.collections.map((c) => <Link key={c.slug} href={`/collections/${c.slug}`} className="flex min-h-11 items-center text-body text-foreground">{c.name}</Link>)}
              <Link href="/collections" className="flex min-h-11 items-center text-body text-muted underline underline-offset-4">All collections</Link>
            </nav>
          )}
          <nav aria-label="Your account" className="flex flex-col border-t border-border-subtle pt-4">
            <Link href="/wishlist" className={small}><Heart className="h-4 w-4" aria-hidden="true" />Wishlist</Link>
            <Link href="/cart" className={small}><ShoppingBag className="h-4 w-4" aria-hidden="true" />Bag</Link>
            <Link href="/account" className={small}><User className="h-4 w-4" aria-hidden="true" />Account</Link>
          </nav>
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  );
}
