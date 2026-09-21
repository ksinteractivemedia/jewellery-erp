import type { Metadata } from "next";
import { CategoryNav, CollectionTiles } from "../../components/home/tiles";
import { Breadcrumbs } from "../../components/ui/breadcrumbs";
import { SectionHeading } from "../../components/ui/section";
import { storeGet } from "../../lib/api";
import { jsonLd, breadcrumbJsonLd } from "../../lib/seo";
import type { StoreNavigation } from "@jewellery/types";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Collections", description: "Browse every collection and category.", alternates: { canonical: "/collections" } };

export default async function CollectionsPage() {
  const nav = await storeGet<StoreNavigation>("/navigation");
  const top = nav.categories.filter((c) => !c.parentSlug);
  return (
    <div className="container-page flex flex-col gap-16 pb-20 pt-6 sm:pt-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumbJsonLd([{ name: "Home", path: "/" }, { name: "Collections", path: "/collections" }])) }} />
      <div className="flex flex-col gap-8"><Breadcrumbs items={[{ name: "Home", href: "/" }, { name: "Collections" }]} /><h1 className="heading-display text-h1 sm:text-display">Collections</h1></div>
      {nav.collections.length > 0 ? <CollectionTiles collections={nav.collections} /> : <p className="text-body text-muted">There are no collections yet.</p>}
      {top.length > 0 && <div className="flex flex-col gap-8"><SectionHeading eyebrow="Or browse by" title="Category" /><CategoryNav categories={top} /></div>}
    </div>
  );
}
