import * as React from "react";
import { Heart, Menu, Search, ShoppingBag, User } from "lucide-react";
import { cn } from "../lib/utils";

export interface StoreNavLink {
  label: string;
  href: string;
}

export interface StoreHeaderProps {
  logo: React.ReactNode;
  links: StoreNavLink[];
  cartCount?: number;
  wishlistCount?: number;
  onMenuClick?: () => void;
  onSearchClick?: () => void;
  onCartClick?: () => void;
  onAccountClick?: () => void;
  onWishlistClick?: () => void;
  renderLink?: (link: StoreNavLink) => React.ReactNode;
  className?: string;
}

/** Editorial storefront header: logo, primary nav, search/account/wishlist/cart. Light theme only. */
export function StoreHeader({
  logo,
  links,
  cartCount = 0,
  wishlistCount = 0,
  onMenuClick,
  onSearchClick,
  onCartClick,
  onAccountClick,
  onWishlistClick,
  renderLink,
  className,
}: StoreHeaderProps) {
  return (
    <header className={cn("sticky top-0 z-30 border-b border-border-subtle bg-surface", className)}>
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6">
        <button
          type="button"
          onClick={onMenuClick}
          aria-label="Open menu"
          className="flex h-9 w-9 items-center justify-center rounded-md text-foreground hover:bg-surface-sunken lg:hidden"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="font-display text-h4 text-foreground">{logo}</div>
        <nav aria-label="Primary" className="hidden flex-1 items-center justify-center gap-6 lg:flex">
          {links.map((link) =>
            renderLink ? (
              renderLink(link)
            ) : (
              <a key={link.href} href={link.href} className="text-body-sm text-foreground hover:text-primary">
                {link.label}
              </a>
            )
          )}
        </nav>
        <div className="ml-auto flex items-center gap-1">
          <button type="button" onClick={onSearchClick} aria-label="Search" className="flex h-9 w-9 items-center justify-center rounded-md text-foreground hover:bg-surface-sunken">
            <Search className="h-[18px] w-[18px]" />
          </button>
          <button type="button" onClick={onAccountClick} aria-label="Account" className="hidden h-9 w-9 items-center justify-center rounded-md text-foreground hover:bg-surface-sunken sm:flex">
            <User className="h-[18px] w-[18px]" />
          </button>
          <button type="button" onClick={onWishlistClick} aria-label={`Wishlist, ${wishlistCount} items`} className="relative hidden h-9 w-9 items-center justify-center rounded-md text-foreground hover:bg-surface-sunken sm:flex">
            <Heart className="h-[18px] w-[18px]" />
            {wishlistCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-medium text-primary-foreground">
                {wishlistCount}
              </span>
            )}
          </button>
          <button type="button" onClick={onCartClick} aria-label={`Cart, ${cartCount} items`} className="relative flex h-9 w-9 items-center justify-center rounded-md text-foreground hover:bg-surface-sunken">
            <ShoppingBag className="h-[18px] w-[18px]" />
            {cartCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-medium text-primary-foreground">
                {cartCount}
              </span>
            )}
          </button>
        </div>
      </div>
    </header>
  );
}
