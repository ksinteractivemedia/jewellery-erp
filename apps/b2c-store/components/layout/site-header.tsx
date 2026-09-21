"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, Heart, Menu, Search, ShoppingBag, User } from "lucide-react";
import type { StoreContent, StoreNavigation } from "@jewellery/types";
import { cn } from "@jewellery/ui";
import { cart, cartCount, useCartLines } from "../../lib/cart";
import { useContent, useNavigation } from "../../lib/queries";
import { useWishlist } from "../../lib/wishlist";
import { ProgressiveImage } from "../ui/progressive-image";
import { MobileNav } from "./mobile-nav";
import { SearchOverlay } from "./search-overlay";

/**
 * Premium navigation: the brand centred in a serif wordmark, quiet uppercase links, and a "Shop" panel that lays out the real
 * categories and collections (from the API) with a real product image. Sticky, with a hairline rule and a soft blur.
 */
export function SiteHeader({ content: initialContent, navigation: initialNav }: { content: StoreContent; navigation: StoreNavigation }) {
  const content = useContent(initialContent).data ?? initialContent;
  const nav = useNavigation(initialNav).data ?? initialNav;
  const pathname = usePathname();
  const [mega, setMega] = React.useState(false);
  const [mobile, setMobile] = React.useState(false);
  const [search, setSearch] = React.useState(false);
  const bag = cartCount(useCartLines());
  const saved = useWishlist().length;

  React.useEffect(() => { setMega(false); setMobile(false); }, [pathname]);
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMega(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const top = nav.categories.filter((c) => !c.parentSlug);
  const featured = top.find((c) => c.image) ?? top[0];
  const link = "relative whitespace-nowrap py-2 text-[0.75rem] font-medium uppercase tracking-[0.16em] text-foreground after:absolute after:inset-x-0 after:-bottom-0.5 after:h-px after:origin-left after:scale-x-0 after:bg-foreground after:transition-transform hover:after:scale-x-100 focus-visible:outline-none focus-visible:after:scale-x-100";
  const icon = "relative flex h-11 w-11 items-center justify-center rounded-full text-foreground transition-colors hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

  return (
    <header className="sticky top-0 z-40 border-b border-border-subtle bg-background/90 backdrop-blur-md" onMouseLeave={() => setMega(false)} data-testid="site-header">
      <div className="container-page grid h-16 grid-cols-[1fr_auto_1fr] items-center lg:h-[72px]">
        <div className="flex min-w-0 items-center gap-1">
          <button type="button" className={cn(icon, "-ml-3 lg:hidden")} aria-label="Open menu" onClick={() => setMobile(true)} data-testid="open-menu"><Menu className="h-5 w-5" /></button>
          {/* On a phone, search sits beside the menu so the wordmark stays centred between two icons a side. */}
          <button type="button" className={cn(icon, "lg:hidden")} aria-label="Search" onClick={() => setSearch(true)} data-testid="open-search-mobile"><Search className="h-5 w-5" /></button>
          <nav aria-label="Primary" className="hidden items-center gap-8 lg:flex">
            <button type="button" className={cn(link, "inline-flex items-center gap-1")} aria-expanded={mega} aria-controls="mega-menu" onMouseEnter={() => setMega(true)} onFocus={() => setMega(true)} onClick={() => setMega((v) => !v)} data-testid="shop-menu">
              Shop <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", mega && "rotate-180")} aria-hidden="true" />
            </button>
            <Link href="/collections" className={link} onMouseEnter={() => setMega(false)}>Collections</Link>
            <Link href="/search?sort=newest" className={link} onMouseEnter={() => setMega(false)}>New arrivals</Link>
          </nav>
        </div>

        <Link href="/" className="justify-self-center text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={`${content.brandName} — home`}>
          <span className="heading-display text-[1.375rem] uppercase tracking-[0.32em] sm:text-[1.625rem]">{content.brandName}</span>
        </Link>

        <div className="flex items-center justify-end">
          <button type="button" className={cn(icon, "hidden lg:flex")} aria-label="Search" onClick={() => setSearch(true)} data-testid="open-search"><Search className="h-5 w-5" /></button>
          <Link href="/account" className={cn(icon, "hidden sm:flex")} aria-label="Account"><User className="h-5 w-5" /></Link>
          <Link href="/wishlist" className={icon} aria-label={saved ? `Wishlist, ${saved} saved` : "Wishlist"} data-testid="wishlist-link">
            <Heart className="h-5 w-5" />
            {saved > 0 && <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-foreground px-1 text-[0.625rem] font-medium text-background">{saved}</span>}
          </Link>
          <button type="button" className={icon} aria-label={bag ? `Bag, ${bag} item${bag === 1 ? "" : "s"}` : "Bag"} onClick={() => cart.openDrawer()} data-testid="open-bag">
            <ShoppingBag className="h-5 w-5" />
            {bag > 0 && <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[0.625rem] font-semibold text-[var(--palette-black)]" data-testid="bag-count">{bag}</span>}
          </button>
        </div>
      </div>

      {mega && (
        <div id="mega-menu" className="hidden border-t border-border-subtle bg-background lg:block" onMouseEnter={() => setMega(true)} data-testid="mega-menu">
          <div className="container-page grid grid-cols-[1fr_1fr_1fr_320px] gap-10 py-10">
            <div className="flex flex-col gap-4">
              <span className="eyebrow">Shop by category</span>
              <ul className="flex flex-col gap-2.5">
                {top.map((c) => (
                  <li key={c.slug}>
                    <Link href={`/category/${c.slug}`} className="font-display text-h4 text-foreground hover:text-muted">{c.name}</Link>
                    <ul className="mt-1 flex flex-col gap-1 pl-0">
                      {nav.categories.filter((s) => s.parentSlug === c.slug).map((s) => <li key={s.slug}><Link href={`/category/${s.slug}`} className="text-body-sm text-muted hover:text-foreground">{s.name}</Link></li>)}
                    </ul>
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex flex-col gap-4">
              <span className="eyebrow">Collections</span>
              <ul className="flex flex-col gap-2.5">
                {nav.collections.map((c) => <li key={c.slug}><Link href={`/collections/${c.slug}`} className="text-body text-foreground hover:text-muted">{c.name}</Link></li>)}
              </ul>
            </div>
            <div className="flex flex-col gap-4">
              <span className="eyebrow">Explore</span>
              <ul className="flex flex-col gap-2.5 text-body">
                <li><Link href="/search?sort=newest" className="hover:text-muted">New arrivals</Link></li>
                <li><Link href="/search?sort=bestselling" className="hover:text-muted">Bestsellers</Link></li>
                <li><Link href="/collections" className="hover:text-muted">All collections</Link></li>
              </ul>
            </div>
            {featured && (
              <Link href={`/category/${featured.slug}`} className="group flex flex-col gap-3">
                <ProgressiveImage src={featured.image?.url} alt={featured.image?.alt ?? featured.name} ratio="aspect-[4/3]" imgClassName="transition-transform duration-700 group-hover:scale-[1.04]" />
                <span className="font-display text-h4">{featured.name}</span>
              </Link>
            )}
          </div>
        </div>
      )}

      <MobileNav open={mobile} onOpenChange={setMobile} navigation={nav} onSearch={() => { setMobile(false); setSearch(true); }} />
      <SearchOverlay open={search} onOpenChange={setSearch} />
    </header>
  );
}
