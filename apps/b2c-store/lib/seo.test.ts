import { describe, expect, it } from "vitest";
import type { StoreProductDetail } from "@jewellery/types";
import { availabilityUrl, breadcrumbJsonLd, jsonLd, productJsonLd } from "./seo";

const product = (over: Partial<StoreProductDetail> = {}): StoreProductDetail => ({
  id: "1", slug: "plain-band", name: "Plain Band", sku: "BAND-1", isNew: false, description: "A band.",
  images: [{ url: "http://api/x.png", alt: "Band" }], collections: [], categoryTrail: [{ name: "Rings", slug: "rings" }], variants: [], tags: [],
  metal: { code: "GOLD", name: "Gold" }, purity: "22K", updatedAt: "2026-09-20T00:00:00.000Z",
  specs: { grossWeight: 10, netWeight: 9.8, stones: [] },
  availability: { status: "IN_STOCK", hallmarked: true },
  price: { status: "AVAILABLE", dynamic: true, total: 7_632_300, computedAt: "2026-09-20T10:00:00Z", breakdown: { metalValue: 0, wastage: 0, makingCharges: 0, stoneValue: 0, discount: 0, taxableValue: 0, gst: 0, total: 7_632_300 }, basis: { grossWeight: 10, netWeight: 9.8, metalName: "Gold", purity: "22K", ratePerGram: 650_000, rateEffectiveFrom: "2026-01-01T00:00:00Z" } },
  ...over,
});

describe("productJsonLd", () => {
  it("describes the product from real fields, with the live price as an Offer", () => {
    const ld = productJsonLd(product(), "Suvarna") as Record<string, any>;
    expect(ld).toMatchObject({ "@type": "Product", name: "Plain Band", sku: "BAND-1", brand: { name: "Suvarna" }, material: "Gold 22K", category: "Rings", weight: { value: 9.8, unitCode: "GRM" } });
    expect(ld.offers).toMatchObject({ "@type": "Offer", priceCurrency: "INR", price: "76323.00", availability: "https://schema.org/InStock" });
    expect(ld.additionalProperty).toContainEqual({ "@type": "PropertyValue", name: "Hallmarked (HUID)", value: "Yes" });
  });
  it("offers NO price when the price is on request — a number is never invented", () => {
    const ld = productJsonLd(product({ price: { status: "ON_REQUEST", reason: "NO_WEIGHT", message: "on request" } }), "Suvarna");
    expect(ld).not.toHaveProperty("offers");
  });
  it("claims no ratings or reviews, because there are none", () => {
    const text = JSON.stringify(productJsonLd(product(), "Suvarna"));
    expect(text).not.toMatch(/aggregateRating|ratingValue|reviewCount|"review"/);
  });
  it("says a design is hallmarked only when the stock records do", () => {
    const ld = productJsonLd(product({ availability: { status: "IN_STOCK", hallmarked: false } }), "Suvarna") as Record<string, any>;
    expect(JSON.stringify(ld.additionalProperty)).not.toMatch(/Hallmarked/);
  });
  it("maps availability", () => {
    expect(availabilityUrl({ status: "OUT_OF_STOCK", hallmarked: false })).toMatch(/OutOfStock/);
    expect(availabilityUrl({ status: "LOW_STOCK", remaining: 2, hallmarked: false })).toMatch(/LimitedAvailability/);
  });
  it("omits fields it has no data for", () => {
    const ld = productJsonLd(product({ description: undefined, images: [], categoryTrail: [], metal: undefined, purity: undefined, specs: { stones: [] } }), "S");
    for (const k of ["description", "image", "category", "material", "weight"]) expect(ld).not.toHaveProperty(k);
  });
});

describe("breadcrumbJsonLd and jsonLd", () => {
  it("numbers the trail from 1 with absolute URLs", () => {
    const ld = breadcrumbJsonLd([{ name: "Home", path: "/" }, { name: "Rings", path: "/category/rings" }]) as any;
    expect(ld.itemListElement.map((i: any) => [i.position, i.name])).toEqual([[1, "Home"], [2, "Rings"]]);
    expect(ld.itemListElement[1].item).toMatch(/^https?:\/\/.+\/category\/rings$/);
  });
  it("cannot be broken out of its <script> tag", () => {
    const out = jsonLd({ name: "</script><script>alert(1)</script>", note: "<!-- x -->" });
    expect(out).not.toContain("</script>");
    expect(out).not.toContain("<");
    expect(JSON.parse(out).name).toBe("</script><script>alert(1)</script>");
  });
});
