import Link from "next/link";
import { FileSignature, Landmark, PackageCheck, ShieldCheck, Truck, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CollectionHero, CreditLimitIndicator, MetricCard, TrustBadge } from "@jewellery/ui";
import { FeaturedProducts } from "../components/featured-products";
import { CATEGORIES, FEATURED_PRODUCTS, PLACEHOLDER_COMPANY } from "../lib/placeholder-data";

export default function WholesaleHomePage() {
  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-14 px-4 py-10 sm:px-6">
      <CollectionHero
        eyebrow="Wholesale Portal"
        title="Wholesale pricing for registered retailers"
        description="Browse the full catalogue at your negotiated price list, build a purchase order, and track credit and invoices in one place."
        image="https://picsum.photos/seed/wholesale-hero/1400/700"
        ctaLabel="Browse full catalogue"
      />

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-[1.2fr_1fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>{PLACEHOLDER_COMPANY.name}</CardTitle>
          </CardHeader>
          <CardContent>
            <CreditLimitIndicator
              creditLimit={PLACEHOLDER_COMPANY.creditLimit}
              outstanding={PLACEHOLDER_COMPANY.outstanding}
              overdueAmount={PLACEHOLDER_COMPANY.overdueAmount}
            />
          </CardContent>
        </Card>
        <MetricCard label="Open purchase orders" value="3" icon={<PackageCheck className="h-4 w-4" />} />
        <MetricCard label="Pending quotations" value="2" icon={<FileSignature className="h-4 w-4" />} />
      </section>

      <section className="flex flex-col gap-6">
        <h2 className="font-display text-h2">Browse by category</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {CATEGORIES.map((c) => (
            <Link key={c.href} href={c.href} className="group relative aspect-square overflow-hidden rounded-lg">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={c.image} alt="" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/5 to-transparent" />
              <span className="absolute inset-x-0 bottom-0 p-3 text-body-sm font-medium text-white">{c.title}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-6">
        <div className="flex items-end justify-between">
          <h2 className="font-display text-h2">Featured this week</h2>
          <Link href="/catalogue" className="text-body-sm text-primary hover:underline">
            View full catalogue
          </Link>
        </div>
        <FeaturedProducts products={FEATURED_PRODUCTS} />
      </section>

      <section className="grid grid-cols-1 gap-6 border-y border-border-subtle py-10 sm:grid-cols-4">
        <TrustBadge icon={ShieldCheck} label="BIS Hallmarked stock" />
        <TrustBadge icon={Landmark} label="GST-compliant invoicing" />
        <TrustBadge icon={Users} label="Dedicated account manager" />
        <TrustBadge icon={Truck} label="Pan-India dispatch" />
      </section>
    </div>
  );
}
