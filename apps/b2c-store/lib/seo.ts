import type { StoreAvailability, StoreContent, StoreProductDetail } from "@jewellery/types";
import { absoluteUrl } from "./site";

/**
 * Structured data (schema.org JSON-LD). Built ONLY from what the API returned: a price appears in `offers` only when the
 * API produced a live price for the piece, and there is no `aggregateRating` or `review` — there are no reviews to describe,
 * and structured data claiming otherwise would be a fabrication a search engine may penalise.
 */
export const availabilityUrl = (a: StoreAvailability) =>
  a.status === "OUT_OF_STOCK" ? "https://schema.org/OutOfStock" : a.status === "LOW_STOCK" ? "https://schema.org/LimitedAvailability" : "https://schema.org/InStock";

export function productJsonLd(p: StoreProductDetail, brand: string) {
  const url = absoluteUrl(`/product/${p.slug}`);
  const price = p.price.status === "AVAILABLE" ? p.price : null;
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: p.name,
    sku: p.sku,
    url,
    ...(p.description ? { description: p.description } : {}),
    ...(p.images.length ? { image: p.images.map((i) => i.url) } : {}),
    brand: { "@type": "Brand", name: brand },
    ...(p.categoryTrail.length ? { category: p.categoryTrail.map((c) => c.name).join(" > ") } : {}),
    ...(p.metal ? { material: [p.metal.name, p.purity].filter(Boolean).join(" ") } : {}),
    ...(p.specs.netWeight !== undefined ? { weight: { "@type": "QuantitativeValue", value: p.specs.netWeight, unitCode: "GRM" } } : {}),
    additionalProperty: [
      ...(p.purity ? [{ "@type": "PropertyValue", name: "Purity", value: p.purity }] : []),
      ...(p.specs.grossWeight !== undefined ? [{ "@type": "PropertyValue", name: "Gross weight", value: `${p.specs.grossWeight} g` }] : []),
      ...(p.availability.hallmarked ? [{ "@type": "PropertyValue", name: "Hallmarked (HUID)", value: "Yes" }] : []),
    ],
    ...(price
      ? { offers: { "@type": "Offer", url, priceCurrency: "INR", price: (price.total / 100).toFixed(2), availability: availabilityUrl(p.availability), itemCondition: "https://schema.org/NewCondition" } }
      : {}),
  };
}

export const breadcrumbJsonLd = (items: { name: string; path: string }[]) => ({
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: items.map((item, i) => ({ "@type": "ListItem", position: i + 1, name: item.name, item: absoluteUrl(item.path) })),
});

export const organizationJsonLd = (c: StoreContent) => ({
  "@context": "https://schema.org",
  "@type": "Organization",
  name: c.brandName,
  url: absoluteUrl("/"),
  ...(c.contact?.email ? { email: c.contact.email } : {}),
  ...(c.contact?.phone ? { telephone: c.contact.phone } : {}),
});

export const websiteJsonLd = (brand: string) => ({
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: brand,
  url: absoluteUrl("/"),
  potentialAction: { "@type": "SearchAction", target: { "@type": "EntryPoint", urlTemplate: `${absoluteUrl("/search")}?q={search_term_string}` }, "query-input": "required name=search_term_string" },
});

/** JSON for a <script type="application/ld+json">, made safe against `</script>` and HTML comments in any string. */
export const jsonLd = (data: unknown) => JSON.stringify(data).replace(/</g, "\\u003c").replace(/-->/g, "--\\u003e");
