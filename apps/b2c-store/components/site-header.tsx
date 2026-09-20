"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnnouncementBar, CartDrawer, StoreHeader } from "@jewellery/ui";
import { NAV_LINKS } from "../lib/placeholder-data";
import { useStore } from "../lib/store-context";
import { SearchDialog } from "./search-dialog";

export function SiteHeader() {
  const router = useRouter();
  const [announcementVisible, setAnnouncementVisible] = React.useState(true);
  const [searchOpen, setSearchOpen] = React.useState(false);
  const { items, subtotal, cartOpen, setCartOpen, removeItem, updateQuantity, wishlist } = useStore();

  return (
    <>
      {announcementVisible && (
        <AnnouncementBar
          message="Free insured shipping on all orders above ₹25,000 · BIS Hallmarked, always"
          onDismiss={() => setAnnouncementVisible(false)}
        />
      )}
      <StoreHeader
        logo={<Link href="/">Suvarna</Link>}
        links={NAV_LINKS}
        renderLink={(link) => (
          <Link key={link.href} href={link.href} className="text-body-sm text-foreground hover:text-primary">
            {link.label}
          </Link>
        )}
        cartCount={items.reduce((n, i) => n + i.quantity, 0)}
        wishlistCount={wishlist.size}
        onSearchClick={() => setSearchOpen(true)}
        onAccountClick={() => router.push("/account")}
        onWishlistClick={() => router.push("/wishlist")}
        onCartClick={() => setCartOpen(true)}
      />
      <SearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
      <CartDrawer
        open={cartOpen}
        onOpenChange={setCartOpen}
        items={items}
        subtotal={subtotal}
        onQuantityChange={updateQuantity}
        onRemove={removeItem}
        onCheckout={() => router.push("/checkout")}
      />
    </>
  );
}
