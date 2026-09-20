import Link from "next/link";
import { RefreshCw, ShieldCheck, Truck } from "lucide-react";
import { CollectionHero, TrustBadge } from "@jewellery/ui";
import { FeaturedProducts } from "../components/featured-products";
import { COLLECTIONS, FEATURED_PRODUCTS } from "../lib/placeholder-data";

export default function HomePage() {
  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-16 px-4 py-10 sm:px-6">
      <CollectionHero
        eyebrow="New Collection"
        title="Festive gold, made to be worn every day"
        description="Hallmarked 22K and 18K pieces, priced live against today's gold rate."
        image="https://picsum.photos/seed/hero-jewellery/1400/800"
        ctaLabel="Shop the collection"
      />

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {COLLECTIONS.map((c) => (
          <Link key={c.href} href={c.href} className="group relative aspect-[4/5] overflow-hidden rounded-lg">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={c.image} alt="" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 flex flex-col gap-0.5 p-5">
              <span className="font-display text-h3 text-white">{c.title}</span>
              <span className="text-body-sm text-white/85">{c.description}</span>
            </div>
          </Link>
        ))}
      </section>

      <section className="flex flex-col gap-6">
        <div className="flex items-end justify-between">
          <h2 className="font-display text-h2">Bestsellers</h2>
          <Link href="/collections/new-arrivals" className="text-body-sm text-primary hover:underline">
            View all
          </Link>
        </div>
        <FeaturedProducts products={FEATURED_PRODUCTS} />
      </section>

      <section className="grid grid-cols-1 gap-6 border-y border-border-subtle py-10 sm:grid-cols-3">
        <TrustBadge icon={ShieldCheck} label="BIS Hallmarked, always" />
        <TrustBadge icon={Truck} label="Free insured shipping" />
        <TrustBadge icon={RefreshCw} label="15-day easy returns" />
      </section>
    </div>
  );
}
