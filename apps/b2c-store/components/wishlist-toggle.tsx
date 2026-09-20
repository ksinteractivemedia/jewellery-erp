"use client";

import { WishlistButton } from "@jewellery/ui";
import { useStore } from "../lib/store-context";

export function WishlistToggle({ id, name }: { id: string; name: string }) {
  const { wishlist, toggleWishlist } = useStore();
  return <WishlistButton active={wishlist.has(id)} onToggle={() => toggleWishlist(id, name)} />;
}
