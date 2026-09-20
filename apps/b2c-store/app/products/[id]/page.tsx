import { notFound } from "next/navigation";
import { ProductGallery, ProductPrice, ReviewSummary, TrustBadge } from "@jewellery/ui";
import { RefreshCw, ShieldCheck, Truck } from "lucide-react";
import { AddToBagButton } from "../../../components/add-to-bag-button";
import { WishlistToggle } from "../../../components/wishlist-toggle";
import { FEATURED_PRODUCTS } from "../../../lib/placeholder-data";

export default function ProductDetailPage({ params }: { params: { id: string } }) {
  const product = FEATURED_PRODUCTS.find((p) => p.id === params.id);
  if (!product) notFound();

  return (
    <div className="mx-auto grid max-w-6xl grid-cols-1 gap-10 px-4 py-10 sm:px-6 lg:grid-cols-2">
      <ProductGallery
        images={[
          { src: product.image, alt: product.name },
          { src: `${product.image}?grayscale`, alt: `${product.name}, detail` },
          { src: `${product.image}?blur=1`, alt: `${product.name}, worn` },
        ]}
      />
      <div className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <h1 className="font-display text-h1">{product.name}</h1>
          <WishlistToggle id={product.id} name={product.name} />
        </div>
        <ReviewSummary average={4.6} count={128} />
        <ProductPrice price={product.price} compareAtPrice={product.compareAtPrice} size="lg" />
        <p className="text-body text-muted">
          {product.purity} hallmarked jewellery, crafted for everyday elegance. Exact weight and making charges are
          confirmed at the time of sale against the live gold rate.
        </p>
        <div className="flex gap-3">
          <AddToBagButton product={product} />
        </div>
        <div className="grid grid-cols-3 gap-4 border-t border-border-subtle pt-6">
          <TrustBadge icon={ShieldCheck} label="BIS Hallmarked" />
          <TrustBadge icon={Truck} label="Insured Shipping" />
          <TrustBadge icon={RefreshCw} label="15-Day Returns" />
        </div>
      </div>
    </div>
  );
}
