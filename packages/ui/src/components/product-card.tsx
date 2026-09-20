import * as React from "react";
import { cn } from "../lib/utils";
import { ProductPrice } from "./product-price";
import { PurityBadge } from "./purity-badge";
import { WishlistButton } from "./wishlist-button";

export interface ProductCardProps {
  name: string;
  image: string;
  imageAlt?: string;
  price: number;
  compareAtPrice?: number;
  purity?: string;
  badge?: string;
  wishlisted?: boolean;
  onWishlistToggle?: () => void;
  onClick?: () => void;
  className?: string;
}

/** Editorial product tile for grids/carousels. Image-forward, minimal chrome. */
export function ProductCard({
  name,
  image,
  imageAlt,
  price,
  compareAtPrice,
  purity,
  badge,
  wishlisted = false,
  onWishlistToggle,
  onClick,
  className,
}: ProductCardProps) {
  return (
    <div className={cn("group flex flex-col gap-3", className)}>
      <div className="relative aspect-[4/5] overflow-hidden rounded-md bg-surface-sunken">
        <button type="button" onClick={onClick} className="block h-full w-full" aria-label={`View ${name}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={image}
            alt={imageAlt ?? name}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            loading="lazy"
          />
        </button>
        {badge && (
          <span className="absolute left-3 top-3 rounded-full bg-surface px-2 py-0.5 text-caption font-medium text-foreground shadow-sm">
            {badge}
          </span>
        )}
        {onWishlistToggle && (
          <div className="absolute right-3 top-3">
            <WishlistButton active={wishlisted} onToggle={onWishlistToggle} />
          </div>
        )}
      </div>
      <div className="flex flex-col gap-1">
        <div className="flex items-start justify-between gap-2">
          <button type="button" onClick={onClick} className="text-left text-body-sm font-medium text-foreground hover:text-primary">
            {name}
          </button>
          {purity && <PurityBadge purity={purity} />}
        </div>
        <ProductPrice price={price} compareAtPrice={compareAtPrice} size="sm" />
      </div>
    </div>
  );
}
