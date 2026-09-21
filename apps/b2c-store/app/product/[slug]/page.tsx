import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { StoreListResult, StoreProductDetail } from "@jewellery/types";
import { Gallery } from "../../../components/product/gallery";
import { Policies, TrustList } from "../../../components/product/policies";
import { ProductCard } from "../../../components/product/product-card";
import { PurchasePanel } from "../../../components/product/purchase-panel";
import { ReviewsSection } from "../../../components/product/reviews";
import { Specs } from "../../../components/product/specs";
import { Breadcrumbs } from "../../../components/ui/breadcrumbs";
import { Section, SectionHeading } from "../../../components/ui/section";
import { storeGetOrNull, storeGet } from "../../../lib/api";
import { breadcrumbJsonLd, jsonLd, productJsonLd } from "../../../lib/seo";
import { getContent } from "../../../lib/server-data";

// A price is a calculation against today's rate — never render it once and keep it.
export const dynamic = "force-dynamic";
type Props = { params: { slug: string } };
const load = async (slug: string) => (await storeGetOrNull<{ product: StoreProductDetail }>(`/products/${slug}`))?.product ?? null;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = await load(params.slug);
  if (!p) return { title: "Piece not found", robots: { index: false } };
  const spec = [p.metal?.name, p.purity, p.specs.netWeight !== undefined ? `${p.specs.netWeight} g` : null].filter(Boolean).join(" · ");
  // The description states what the piece IS. It deliberately carries no price: a price in a cached snippet would be stale within the hour.
  const description = p.description ?? `${p.name}${spec ? ` — ${spec}` : ""}. Priced live against today's metal rate.`;
  return {
    title: p.name,
    description,
    alternates: { canonical: `/product/${p.slug}` },
    openGraph: { type: "website", title: p.name, description, url: `/product/${p.slug}`, ...(p.images[0] ? { images: [{ url: p.images[0].url, alt: p.images[0].alt }] } : {}) },
    twitter: { card: "summary_large_image", title: p.name, description },
  };
}

export default async function ProductPage({ params }: Props) {
  const [product, content] = await Promise.all([load(params.slug), getContent()]);
  if (!product) notFound();
  const related = product.category ? await storeGet<StoreListResult>(`/products?category=${product.category.slug}&pageSize=5&sort=bestselling`).catch(() => null) : null;
  const more = (related?.items ?? []).filter((r) => r.slug !== product.slug).slice(0, 4);
  const trail = [{ name: "Home", href: "/" }, ...product.categoryTrail.map((c) => ({ name: c.name, href: `/category/${c.slug}` })), { name: product.name }];

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd([productJsonLd(product, content.brandName), breadcrumbJsonLd(trail.map((t, i) => ({ name: t.name, path: i === trail.length - 1 ? `/product/${product.slug}` : t.href! })))]) }} />
      <div className="container-page flex flex-col gap-6 pb-24 pt-6 sm:pt-8 lg:pb-20">
        <Breadcrumbs items={trail} />
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-16 xl:gap-24">
          <Gallery images={product.images} name={product.name} />
          <div className="lg:sticky lg:top-28 lg:self-start">
            <PurchasePanel initial={product} />
          </div>
        </div>
      </div>

      <Section tone="sunken" label="Details">
        <div className="grid gap-14 lg:grid-cols-2 lg:gap-24">
          <div className="flex flex-col gap-6">
            <SectionHeading eyebrow="The piece" title="Details" />
            {product.description && <p className="max-w-prose text-body-lg text-muted" data-testid="description">{product.description}</p>}
            <Specs product={product} />
          </div>
          <div className="flex flex-col gap-8">
            <TrustList trust={content.trust} />
            <Policies policies={content.policies} />
          </div>
        </div>
      </Section>

      <Section label="Reviews"><ReviewsSection /></Section>

      {more.length > 0 && (
        <Section tone="plain" label="You may also like">
          <div className="flex flex-col gap-10"><SectionHeading eyebrow="More to explore" title="You may also like" href={`/category/${product.category!.slug}`} linkLabel={`All ${product.category!.name.toLowerCase()}`} /><ul className="grid grid-cols-2 gap-x-4 gap-y-10 sm:gap-x-6 lg:grid-cols-4">{more.map((p) => <li key={p.id}><ProductCard product={p} /></li>)}</ul></div>
        </Section>
      )}
    </>
  );
}
