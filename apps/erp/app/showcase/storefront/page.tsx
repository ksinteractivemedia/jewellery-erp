"use client";

import * as React from "react";
import { Award, RefreshCw, ShieldCheck, Truck } from "lucide-react";
import {
  Button,
  CartDrawer,
  type CartLineItem,
  CheckoutSummary,
  CollectionHero,
  FilterDrawer,
  Label,
  ProductCard,
  ProductGallery,
  ProductGrid,
  ProductPrice,
  ProductPriceBreakdown,
  ReviewSummary,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  StoreFooter,
  StoreHeader,
  TrustBadge,
} from "@jewellery/ui";

const products = [
  { id: "p1", name: "Aarna Gold Bangle", purity: "22K", price: 118000, compareAtPrice: 128000, image: "https://picsum.photos/seed/aarna/480/600" },
  { id: "p2", name: "Zaira Diamond Necklace", purity: "18K", price: 214000, image: "https://picsum.photos/seed/zaira/480/600" },
  { id: "p3", name: "Rihaan Solitaire Ring", purity: "22K", price: 41500, image: "https://picsum.photos/seed/rihaan/480/600" },
  { id: "p4", name: "Meher Pearl Studs", purity: "18K", price: 28500, image: "https://picsum.photos/seed/meher/480/600" },
];

export default function StorefrontShowcase() {
  const [cartOpen, setCartOpen] = React.useState(false);
  const [filterOpen, setFilterOpen] = React.useState(false);
  const [wishlist, setWishlist] = React.useState<Set<string>>(new Set(["p2"]));
  const [items, setItems] = React.useState<CartLineItem[]>([
    { id: "p1", name: "Aarna Gold Bangle", image: "https://picsum.photos/seed/aarna/200/240", price: 118000, quantity: 1, variant: "22K · Size M" },
    { id: "p3", name: "Rihaan Solitaire Ring", image: "https://picsum.photos/seed/rihaan/200/240", price: 41500, quantity: 2, variant: "22K · Size 14" },
  ]);

  const subtotal = items.reduce((sum, i) => sum + i.price * i.quantity, 0);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <StoreHeader
        logo="Suvarna"
        links={[
          { label: "New Arrivals", href: "#new-arrivals" },
          { label: "Bridal", href: "#bridal" },
          { label: "Gold", href: "#gold" },
          { label: "Diamond", href: "#diamond" },
        ]}
        cartCount={items.length}
        wishlistCount={wishlist.size}
        onCartClick={() => setCartOpen(true)}
      />

      <main className="mx-auto flex max-w-6xl flex-col gap-16 px-4 py-10 sm:px-6">
        <CollectionHero
          eyebrow="New Collection"
          title="Festive gold, made to be worn every day"
          description="Hallmarked 22K and 18K pieces, priced live against today's gold rate."
          image="https://picsum.photos/seed/hero-jewellery/1200/700"
          ctaLabel="Shop the collection"
        />

        <section className="flex flex-col gap-6">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-h2">Bestsellers</h2>
            <FilterDrawer
              open={filterOpen}
              onOpenChange={setFilterOpen}
              trigger={<Button variant="secondary">Filter</Button>}
              onApply={() => setFilterOpen(false)}
              onClear={() => setFilterOpen(false)}
              resultCount={products.length}
            >
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="filter-metal">Metal</Label>
                  <Select defaultValue="all">
                    <SelectTrigger id="filter-metal">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All metals</SelectItem>
                      <SelectItem value="gold">Gold</SelectItem>
                      <SelectItem value="silver">Silver</SelectItem>
                      <SelectItem value="platinum">Platinum</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </FilterDrawer>
          </div>
          <ProductGrid>
            {products.map((p) => (
              <ProductCard
                key={p.id}
                name={p.name}
                image={p.image}
                purity={p.purity}
                price={p.price}
                compareAtPrice={p.compareAtPrice}
                wishlisted={wishlist.has(p.id)}
                onWishlistToggle={() =>
                  setWishlist((prev) => {
                    const next = new Set(prev);
                    next.has(p.id) ? next.delete(p.id) : next.add(p.id);
                    return next;
                  })
                }
              />
            ))}
          </ProductGrid>
        </section>

        <section className="grid grid-cols-1 gap-10 lg:grid-cols-2">
          <ProductGallery
            images={[
              { src: "https://picsum.photos/seed/zaira-1/700/700", alt: "Zaira Diamond Necklace, front view" },
              { src: "https://picsum.photos/seed/zaira-2/700/700", alt: "Zaira Diamond Necklace, detail" },
              { src: "https://picsum.photos/seed/zaira-3/700/700", alt: "Zaira Diamond Necklace, worn" },
            ]}
          />
          <div className="flex flex-col gap-4">
            <h1 className="font-display text-h1">Zaira Diamond Necklace</h1>
            <ReviewSummary average={4.6} count={128} />
            <ProductPrice price={214000} size="lg" />
            <p className="text-body text-muted">
              18K gold necklace with hallmark certification, set with brilliant-cut diamonds. Net metal weight 34.100g.
            </p>
            <ProductPriceBreakdown metalValue={233332} makingCharge={27999} stoneValue={18500} tax={8176} total={279507} />
            <div className="flex gap-3">
              <Button variant="primary" size="lg" className="flex-1">
                Add to bag
              </Button>
              <Button variant="secondary" size="lg">
                Buy now
              </Button>
            </div>
            <div className="grid grid-cols-3 gap-4 border-t border-border-subtle pt-6">
              <TrustBadge icon={ShieldCheck} label="BIS Hallmarked" />
              <TrustBadge icon={Truck} label="Insured Shipping" />
              <TrustBadge icon={RefreshCw} label="15-Day Returns" />
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-md">
          <h2 className="mb-4 font-display text-h2">Checkout summary</h2>
          <CheckoutSummary
            items={items.map((i) => ({ name: i.name, image: i.image, quantity: i.quantity, price: i.price }))}
            lines={[
              { label: "Subtotal", amount: subtotal },
              { label: "Shipping", amount: 0, muted: true },
              { label: "GST", amount: Math.round(subtotal * 0.03) },
            ]}
            total={subtotal + Math.round(subtotal * 0.03)}
          />
        </section>

        <div className="flex items-center justify-center gap-2 text-caption text-muted">
          <Award className="h-4 w-4" /> Every purchase is backed by a certified hallmarking record.
        </div>
      </main>

      <StoreFooter
        logo="Suvarna"
        tagline="Fine jewellery, hallmarked and made to last."
        columns={[
          { heading: "Shop", links: [{ label: "New Arrivals", href: "#shop-new" }, { label: "Bridal", href: "#shop-bridal" }] },
          { heading: "Help", links: [{ label: "Shipping", href: "#help-shipping" }, { label: "Returns", href: "#help-returns" }] },
          { heading: "Company", links: [{ label: "About", href: "#company-about" }, { label: "Stores", href: "#company-stores" }] },
        ]}
        bottomNote="© 2026 Suvarna Jewellers. All rights reserved."
      />

      <CartDrawer
        open={cartOpen}
        onOpenChange={setCartOpen}
        items={items}
        subtotal={subtotal}
        onQuantityChange={(id, quantity) => setItems((prev) => prev.map((i) => (i.id === id ? { ...i, quantity } : i)))}
        onRemove={(id) => setItems((prev) => prev.filter((i) => i.id !== id))}
        onCheckout={() => setCartOpen(false)}
      />
    </div>
  );
}
