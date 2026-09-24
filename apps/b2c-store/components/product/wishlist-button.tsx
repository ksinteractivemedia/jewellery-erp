"use client";

import { Heart } from "lucide-react";
import { cn, toast } from "@jewellery/ui";
import { useWishlist, wishlist } from "../../lib/wishlist";

/** Heart toggle for a design. Kept on this device (no account needed); the list is slugs only. */
export function WishlistButton({ slug, name, className, withLabel }: { slug: string; name: string; className?: string; withLabel?: boolean }) {
  const saved = useWishlist().includes(slug);
  return (
    <button
      type="button"
      aria-pressed={saved}
      aria-label={saved ? `Remove ${name} from wishlist` : `Add ${name} to wishlist`}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        wishlist.toggle(slug);
        toast({ title: saved ? "Removed from wishlist" : "Saved to wishlist", description: name });
      }}
      className={cn(withLabel ? "inline-flex h-12 items-center gap-2 border border-border px-5 text-[0.8125rem] font-medium uppercase tracking-[0.12em] hover:border-foreground" : "flex h-11 w-11 items-center justify-center rounded-full bg-surface/90 text-foreground shadow-sm backdrop-blur transition-colors hover:bg-surface", "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", className)}
      data-testid="wishlist-toggle"
    >
      <Heart className={cn("h-[18px] w-[18px] transition-colors", saved && "fill-primary text-primary")} aria-hidden="true" />
      {withLabel && (saved ? "Saved" : "Wishlist")}
    </button>
  );
}
