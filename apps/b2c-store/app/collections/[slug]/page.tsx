import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { StoreNavigation } from "@jewellery/types";
import { ListingPage } from "../../../components/listing/listing-page";
import { storeGet } from "../../../lib/api";
import { breadcrumbJsonLd, jsonLd } from "../../../lib/seo";

export const dynamic = "force-dynamic";
type Props = { params: { slug: string }; searchParams: Record<string, string | string[] | undefined> };
const find = async (slug: string) => (await storeGet<StoreNavigation>("/navigation")).collections.find((c) => c.slug === slug);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const c = await find(params.slug);
  if (!c) return { title: "Collection not found", robots: { index: false } };
  return { title: c.name, description: c.description ?? `${c.name} — ${c.productCount} pieces.`, alternates: { canonical: `/collections/${c.slug}` }, openGraph: { title: c.name, ...(c.image ? { images: [c.image.url] } : {}) } };
}

export default async function CollectionPage({ params, searchParams }: Props) {
  const c = await find(params.slug);
  if (!c) notFound();
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumbJsonLd([{ name: "Home", path: "/" }, { name: "Collections", path: "/collections" }, { name: c.name, path: `/collections/${c.slug}` }])) }} />
      <ListingPage basePath={`/collections/${c.slug}`} scope={{ collection: c.slug }} eyebrow="Collection" title={c.name} description={c.description} breadcrumb={[{ name: "Home", href: "/" }, { name: "Collections", href: "/collections" }, { name: c.name }]} searchParams={searchParams} />
    </>
  );
}
