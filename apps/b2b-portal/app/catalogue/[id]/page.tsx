import { notFound } from "next/navigation";
import { Landmark, ShieldCheck, Truck } from "lucide-react";
import { Badge, CurrencyDisplay, ProductGallery, TrustBadge } from "@jewellery/ui";
import { AddToListButton } from "../../../components/add-to-list-button";
import { FEATURED_PRODUCTS } from "../../../lib/placeholder-data";

export default function CatalogueDetailPage({ params }: { params: { id: string } }) {
  const product = FEATURED_PRODUCTS.find((p) => p.id === params.id);
  if (!product) notFound();

  return (
    <div className="mx-auto grid max-w-6xl grid-cols-1 gap-10 px-4 py-10 sm:px-6 lg:grid-cols-2">
      <ProductGallery
        images={[
          { src: product.image, alt: product.name },
          { src: `${product.image}?grayscale`, alt: `${product.name}, detail` },
        ]}
      />
      <div className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <h1 className="font-display text-h1">{product.name}</h1>
          <Badge variant="outline">MOQ {product.moq}</Badge>
        </div>
        <CurrencyDisplay amount={product.price} size="lg" />
        <p className="text-body text-muted">
          Wholesale price shown for {product.purity}. Final invoiced price is confirmed against your negotiated price
          list and the gold rate on the day of order confirmation.
        </p>
        <div className="flex gap-3">
          <AddToListButton product={product} />
        </div>
        <div className="grid grid-cols-3 gap-4 border-t border-border-subtle pt-6">
          <TrustBadge icon={ShieldCheck} label="BIS Hallmarked" />
          <TrustBadge icon={Landmark} label="GST Invoicing" />
          <TrustBadge icon={Truck} label="Pan-India Dispatch" />
        </div>
      </div>
    </div>
  );
}
