import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { StoreCategoryNode, StoreNavigation } from "@jewellery/types";
import { ListingPage } from "../../../components/listing/listing-page";
import { storeGet } from "../../../lib/api";
import { breadcrumbJsonLd, jsonLd } from "../../../lib/seo";

export const dynamic = "force-dynamic";
type Props = { params: { slug: string }; searchParams: Record<string, string | string[] | undefined> };

async function load(slug: string) {
  const nav = await storeGet<StoreNavigation>("/navigation");
  const category = nav.categories.find((c) => c.slug === slug);
  const trail: StoreCategoryNode[] = [];
  for (let c = category; c; c = c.parentSlug ? nav.categories.find((x) => x.slug === c!.parentSlug) : undefined) trail.unshift(c);
  return { category, trail };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { category } = await load(params.slug);
  if (!category) return { title: "Category not found", robots: { index: false } };
  return { title: category.name, description: category.description ?? `Shop ${category.name.toLowerCase()} — ${category.productCount} pieces, priced live.`, alternates: { canonical: `/category/${category.slug}` }, openGraph: { title: category.name, ...(category.image ? { images: [category.image.url] } : {}) } };
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const { category, trail } = await load(params.slug);
  if (!category) notFound();
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumbJsonLd([{ name: "Home", path: "/" }, ...trail.map((c) => ({ name: c.name, path: `/category/${c.slug}` }))])) }} />
      <ListingPage basePath={`/category/${category.slug}`} scope={{ category: category.slug }} eyebrow="Jewellery" title={category.name} description={category.description} breadcrumb={[{ name: "Home", href: "/" }, ...trail.map((c, i) => ({ name: c.name, ...(i < trail.length - 1 ? { href: `/category/${c.slug}` } : {}) }))]} searchParams={searchParams} />
    </>
  );
}
