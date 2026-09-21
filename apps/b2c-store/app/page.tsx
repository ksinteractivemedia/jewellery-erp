import type { Metadata } from "next";
import Link from "next/link";
import type { StoreHome } from "@jewellery/types";
import { CollectionTiles, CategoryNav } from "../components/home/tiles";
import { Hero } from "../components/home/hero";
import { Newsletter } from "../components/home/newsletter";
import { ProductRail } from "../components/home/product-rail";
import { Story } from "../components/home/story";
import { TrustStrip } from "../components/home/trust-strip";
import { ReviewsSection } from "../components/product/reviews";
import { Section, SectionHeading } from "../components/ui/section";
import { storeGet } from "../lib/api";

// Live prices: rendered per request, never frozen at build time.
export const dynamic = "force-dynamic";
export const metadata: Metadata = { alternates: { canonical: "/" } };

export default async function HomePage() {
  const home = await storeGet<StoreHome>("/home");
  const { content } = home;
  const heroImage = home.featured[0]?.image ?? home.newArrivals[0]?.image;
  const storyImage = home.categories.find((c) => c.image)?.image ?? home.newArrivals[1]?.image;
  return (
    <>
      {content.hero && <Hero hero={content.hero} image={heroImage} />}

      {home.categories.length > 0 && (
        <Section label="Shop by category" className="pb-6 sm:pb-8">
          <div className="flex flex-col gap-10"><SectionHeading eyebrow="Shop by category" title="Find your piece" href="/collections" linkLabel="All collections" /><CategoryNav categories={home.categories} /></div>
        </Section>
      )}

      {home.collections.length > 0 && (
        <Section label="Featured collections">
          <div className="flex flex-col gap-10"><SectionHeading eyebrow="Collections" title="Curated for you" href="/collections" /><CollectionTiles collections={home.collections} /></div>
        </Section>
      )}

      <ProductRail eyebrow="Featured" title="Hand-picked pieces" products={home.featured} tone="sunken" testId="featured-products" />
      <ProductRail eyebrow="Just in" title="New arrivals" href="/search?sort=newest" linkLabel="See all new" products={home.newArrivals} testId="new-arrivals" />
      {content.story && <Story story={content.story} image={storyImage} />}
      <ProductRail eyebrow="Most loved" title="Bestsellers" description="The pieces our customers have actually bought most." href="/search?sort=bestselling" linkLabel="See all" products={home.bestsellers} testId="bestsellers" />
      <TrustStrip trust={content.trust} />
      <Section label="Reviews"><ReviewsSection heading="What customers say" compact /></Section>
      <Newsletter brand={content.brandName} />
    </>
  );
}
