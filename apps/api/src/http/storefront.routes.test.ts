import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import type { StoreListResult, StorePrice } from "@jewellery/types";
import { buildTestApp } from "../../test/helpers";
import { type World, makeWorld, receive, someOrder, someUser } from "../../test/inventory-fixtures";
import { createProductCategory } from "../modules/catalog/product-category.repository";
import { createProductCollection } from "../modules/catalog/product-collection.repository";
import { createProductVariant } from "../modules/catalog/product-variant.repository";
import { createProduct } from "../modules/catalog/product.repository";
import { createTaxRule } from "../modules/compliance/tax-rule.repository";
import { reserveItems, sellItems } from "../modules/inventory/stock-operations";
import { ProductModel } from "../modules/catalog/product.model";
import { createMediaService } from "../modules/media/media.service";
import { createMemoryStorage } from "../modules/media/storage";
import { createMetalRate } from "../modules/metals/metal-rate.repository";
import { createPricingRule } from "../modules/pricing/pricing-rule.repository";
import { NewsletterSubscriptionModel } from "../modules/storefront/newsletter.model";
import { StorefrontContentModel } from "../modules/storefront/storefront-content.model";
import { createStorefrontService } from "../modules/storefront/storefront.service";
import { createStorefrontRouter } from "./routes/storefront.routes";

let t: ReturnType<typeof buildTestApp>;
let w: World;
const PAST = new Date("2026-01-01");
const get = (path: string) => request(t.app).get(`/api/store${path}`);
const priceOf = (p: { price: StorePrice }) => p.price;
const total = (p: { price: StorePrice }) => (p.price.status === "AVAILABLE" ? p.price.total : null);
const names = (r: { body: StoreListResult }) => r.body.items.map((i) => i.name);

interface Shop {
  band: { id: string };
  solitaire: { id: string };
  kundan: { id: string };
  noWeight: { id: string };
  silver: { id: string };
  chokerCat: string;
}
let shop: Shop;

async function stock(productId: string, over: Record<string, unknown> = {}) {
  return receive(w, { productId, grossWeight: 5, cost: 100_00, ...over });
}

/** A small shop with one of every pricing situation. Expected prices were computed with exact fractions, not by the code under test. */
beforeEach(async () => {
  t = buildTestApp();
  w = await makeWorld();
  await createMetalRate({ metalId: w.gold, purity: "22K", ratePerGram: 650_000, effectiveFrom: PAST, source: "MANUAL" } as never);
  await createTaxRule({ name: "GST", hsnCode: "7113", intraState: { cgst: 1.5, sgst: 1.5 }, interState: { igst: 3 }, validFrom: PAST });
  await createPricingRule({ name: "Gold retail", metalId: w.gold, customerType: "B2C", makingChargeType: "PERCENTAGE", makingChargeValue: 12, wastageType: "PERCENTAGE", wastageValue: 2, validFrom: PAST } as never);
  await StorefrontContentModel.create({ key: "default", content: { brandName: "Suvarna", announcements: [], trust: [], policies: {}, featured: { collectionSlugs: [], productSlugs: [] }, pricing: { hsnCode: "7113" } } });

  const rings = await createProductCategory({ name: "Rings" });
  const necklaces = await createProductCategory({ name: "Necklaces" });
  const chokers = await createProductCategory({ name: "Chokers", parentId: necklaces.id });
  const bridal = await createProductCollection({ name: "Bridal Edit" });
  const base = { b2cEnabled: true, isActive: true, images: [{ key: "a1.png", alt: "Front" }, { key: "a2.png" }] };

  const band = await createProduct({ ...base, sku: "BAND-1", name: "Plain Band", metalId: w.gold, purity: "22K", categoryId: rings.id, defaultGrossWeight: 10, defaultNetWeight: 10, tags: ["band", "daily"] } as never);
  const solitaire = await createProduct({ ...base, sku: "SOL-1", name: "Solitaire Ring", metalId: w.gold, purity: "18K", categoryId: rings.id, collectionIds: [bridal.id], defaultGrossWeight: 4, defaultNetWeight: 3.9, stoneDetails: [{ name: "Diamond", caratWeight: 0.3, quantity: 1, quality: "VS1" }], stoneValue: 3_000_000 } as never);
  const kundan = await createProduct({ ...base, sku: "KUN-1", name: "Kundan Choker", metalId: w.gold, purity: "22K", categoryId: chokers.id, collectionIds: [bridal.id], defaultGrossWeight: 30, defaultNetWeight: 28, stoneDetails: [{ name: "Polki", caratWeight: 5, quantity: 30 }] } as never); // stones, no stone value
  const noWeight = await createProduct({ ...base, sku: "NOW-1", name: "Weightless Pendant", metalId: w.gold, purity: "22K" } as never);
  const silver = await createProduct({ ...base, sku: "SLV-1", name: "Silver Ring", metalId: w.silver, purity: "925", categoryId: rings.id, defaultGrossWeight: 8, defaultNetWeight: 8 } as never); // no silver making rule
  await createProduct({ sku: "HID-1", name: "B2B Only Bar", metalId: w.gold, purity: "22K", b2cEnabled: false, defaultGrossWeight: 5 } as never);
  await createProduct({ sku: "OFF-1", name: "Retired Ring", metalId: w.gold, purity: "22K", b2cEnabled: true, isActive: false, defaultGrossWeight: 5 } as never);
  // Creation times a second apart (oldest first), so "newest first" is unambiguous rather than a millisecond race.
  const order = ["BAND-1", "SOL-1", "KUN-1", "NOW-1", "SLV-1"];
  for (const [i, sku] of order.entries()) await ProductModel.collection.updateOne({ sku }, { $set: { createdAt: new Date(Date.now() - (order.length - i) * 1000) } });
  shop = { band, solitaire, kundan, noWeight, silver, chokerCat: chokers.id };
});

describe("live prices — computed by the pricing engine, never stored", () => {
  it("prices a 22K design from today's rate to the paisa (checked against exact fractions)", async () => {
    const band = (await get("/products/plain-band")).body.product;
    expect(band.price).toMatchObject({
      status: "AVAILABLE",
      dynamic: true,
      total: 7_632_300,
      breakdown: { metalValue: 6_500_000, wastage: 130_000, makingCharges: 780_000, stoneValue: 0, discount: 0, taxableValue: 7_410_000, gst: 222_300, total: 7_632_300 },
      basis: { grossWeight: 10, netWeight: 10, metalName: "Gold", purity: "22K", ratePerGram: 650_000 },
    });
    expect(Date.parse(band.price.computedAt)).not.toBeNaN();
    expect(Date.parse(band.price.basis.rateEffectiveFrom)).toBe(PAST.getTime());
  });

  it("carries a purity's rate to another purity by fineness, and includes the stones' value", async () => {
    const sol = (await get("/products/solitaire-ring")).body.product;
    expect(sol.price.breakdown).toMatchObject({ metalValue: 2_075_600, wastage: 41_512, makingCharges: 249_072, stoneValue: 3_000_000, taxableValue: 5_366_184, gst: 160_986, total: 5_527_170 });
    expect(sol.price.basis.ratePerGram).toBe(532_205); // 22K ₹6,500 × 0.75 ÷ 0.916
    expect(sol.price.basis.netWeight).toBe(3.9);
  });

  it("follows the metal rate: a new quote changes the price on the next request", async () => {
    await createMetalRate({ metalId: w.gold, purity: "22K", ratePerGram: 700_000, effectiveFrom: new Date(Date.now() - 1000), source: "MANUAL" } as never);
    expect(total((await get("/products/plain-band")).body.product)).toBe(8_219_400);
  });

  it("ignores a rate that is not yet in force", async () => {
    await createMetalRate({ metalId: w.gold, purity: "22K", ratePerGram: 900_000, effectiveFrom: new Date(Date.now() + 86_400_000), source: "MANUAL" } as never);
    expect(total((await get("/products/plain-band")).body.product)).toBe(7_632_300);
  });

  it("always adds up: taxable = the parts less the discount, total = taxable + GST", async () => {
    for (const p of (await get("/products")).body.items as { price: StorePrice }[]) {
      if (p.price.status !== "AVAILABLE") continue;
      const b = p.price.breakdown;
      expect(b.taxableValue).toBe(b.metalValue + b.wastage + b.makingCharges + b.stoneValue - b.discount);
      expect(b.total).toBe(b.taxableValue + b.gst);
      expect(p.price.total).toBe(b.total);
    }
  });

  it("applies a stored B2C discount rule and shows it as a discount, not a lower rate", async () => {
    await createPricingRule({ name: "Festive", metalId: w.gold, purity: "22K", customerType: "B2C", discount: { type: "PERCENTAGE", value: 50, appliesTo: "MAKING_CHARGES" }, validFrom: PAST } as never);
    const price = (await get("/products/plain-band")).body.product.price;
    expect(price.breakdown.discount).toBe(390_000); // half the making charge
    expect(price.breakdown.makingCharges).toBe(780_000);
    expect(price.total).toBe(7_632_300 - 390_000 - 11_700); // less the GST on what was discounted: 1.5% × 390,000 = 5,850 twice
  });

  it("never returns a bare number: there is no `price` that is not a status object", async () => {
    for (const p of (await get("/products")).body.items) expect(typeof priceOf(p)).toBe("object");
  });
});

describe("price on request — an honest 'no', with the reason", () => {
  const reason = async (slug: string) => (await get(`/products/${slug}`)).body.product.price;

  it("stones without a stone value: the price would leave the stones out", async () => {
    expect(await reason("kundan-choker")).toMatchObject({ status: "ON_REQUEST", reason: "STONE_VALUE_MISSING" });
  });
  it("no weight on the design", async () => {
    expect(await reason("weightless-pendant")).toMatchObject({ status: "ON_REQUEST", reason: "NO_WEIGHT" });
  });
  it("no making-charge rule for the metal: a price without making would be wrong", async () => {
    await createMetalRate({ metalId: w.silver, purity: "925", ratePerGram: 9_000, effectiveFrom: PAST, source: "MANUAL" } as never); // silver has a rate but no rule
    expect(await reason("silver-ring")).toMatchObject({ status: "ON_REQUEST", reason: "PRICING_NOT_CONFIGURED" });
  });
  it("no metal rate at all", async () => {
    // Gold has a rate; silver has none. Give silver a making rule so the ONLY thing missing is the metal rate.
    await createPricingRule({ name: "Silver retail", metalId: w.silver, makingChargeType: "PER_GRAM", makingChargeValue: 800, validFrom: PAST } as never);
    expect(await reason("silver-ring")).toMatchObject({ status: "ON_REQUEST", reason: "NO_METAL_RATE" });
  });
  it("no GST rule in force: a tax rate is never guessed", async () => {
    await StorefrontContentModel.updateOne({ key: "default" }, { $set: { "content.pricing": { hsnCode: "9999" } } });
    expect(await reason("plain-band")).toMatchObject({ status: "ON_REQUEST", reason: "PRICING_NOT_CONFIGURED" });
  });
  it("no HSN configured", async () => {
    await StorefrontContentModel.deleteMany({});
    expect(await reason("plain-band")).toMatchObject({ status: "ON_REQUEST", reason: "PRICING_NOT_CONFIGURED" });
  });
  it("carries a message a shopper can read, and no total", async () => {
    const p = await reason("kundan-choker");
    expect(p.message).toMatch(/on request/i);
    expect(p.total).toBeUndefined();
    expect(p.breakdown).toBeUndefined();
  });
});

describe("what a shopper may see", () => {
  it("lists only active, B2C-enabled designs", async () => {
    const r = await get("/products");
    expect(names(r).sort()).toEqual(["Kundan Choker", "Plain Band", "Silver Ring", "Solitaire Ring", "Weightless Pendant"]);
    expect((await get("/products/b2b-only-bar")).status).toBe(404);
    expect((await get("/products/retired-ring")).status).toBe(404);
    expect((await get("/products/nope")).status).toBe(404);
  });

  it("leaks nothing internal: no cost, margin, rule or database ids, other channels or stock counts", async () => {
    await stock(shop.band.id, { cost: 999_99 });
    const text = [(await get("/products")).text, (await get("/products/plain-band")).text, (await get("/home")).text, (await get("/navigation")).text].join("\n");
    expect(text).not.toMatch(/"cost"|margin|"_id"|__v|b2bEnabled|b2cEnabled|ruleId|shadowed|hsnCode|"pricing"|999\.99|99999/i);
  });

  it("is public: no authentication is asked for", async () => {
    for (const path of ["/content", "/navigation", "/home", "/products", "/products/plain-band", "/sitemap", "/reviews"]) expect((await get(path)).status, path).toBe(200);
  });

  it("may be cached briefly, but never a quote", async () => {
    expect((await get("/products")).headers["cache-control"]).toMatch(/max-age=15/);
    expect((await request(t.app).post("/api/store/cart/quote").send({ lines: [{ slug: "plain-band", quantity: 1 }] })).headers["cache-control"]).toBe("no-store");
  });
});

describe("availability tells the truth about stock", () => {
  it("out of stock when no piece is sellable", async () => {
    expect((await get("/products/plain-band")).body.product.availability).toEqual({ status: "OUT_OF_STOCK", hallmarked: false });
  });

  it("in stock with plenty, low stock (with the real number) with a few", async () => {
    for (let i = 0; i < 4; i++) await stock(shop.band.id);
    expect((await get("/products/plain-band")).body.product.availability.status).toBe("IN_STOCK");
    expect((await get("/products/plain-band")).body.product.availability.remaining).toBeUndefined(); // a large count is not disclosed
    await stock(shop.solitaire.id);
    await stock(shop.solitaire.id);
    expect((await get("/products/solitaire-ring")).body.product.availability).toMatchObject({ status: "LOW_STOCK", remaining: 2 });
  });

  it("does not count reserved or sold pieces", async () => {
    const a = await stock(shop.band.id);
    const b = await stock(shop.band.id);
    await stock(shop.band.id);
    await reserveItems({ performedBy: someUser() }, { itemIds: [a.id], referenceId: someOrder() });
    await sellItems({ performedBy: someUser() }, { itemIds: [b.id], referenceType: "ORDER", referenceId: someOrder() });
    expect((await get("/products/plain-band")).body.product.availability).toMatchObject({ status: "LOW_STOCK", remaining: 1 });
  });

  it("says a design is hallmarked only when EVERY available piece carries a HUID", async () => {
    await stock(shop.band.id, { huid: "AAAA11" });
    expect((await get("/products/plain-band")).body.product.availability.hallmarked).toBe(true);
    await stock(shop.band.id); // one without
    expect((await get("/products/plain-band")).body.product.availability.hallmarked).toBe(false);
  });

  it("gives each variant its own availability and its own price", async () => {
    const v14 = await createProductVariant({ productId: shop.solitaire.id, sku: "SOL-1-S14", attributes: { size: "14" } });
    await createProductVariant({ productId: shop.solitaire.id, sku: "SOL-1-S16", attributes: { size: "16" }, defaultGrossWeight: 4.5, defaultNetWeight: 4.4 });
    await stock(shop.solitaire.id, { variantId: v14.id });
    const variants = (await get("/products/solitaire-ring")).body.product.variants;
    expect(variants.map((v: { sku: string }) => v.sku)).toEqual(["SOL-1-S14", "SOL-1-S16"]);
    expect(variants[0].availability.status).toBe("LOW_STOCK");
    expect(variants[1].availability.status).toBe("OUT_OF_STOCK");
    expect(variants[0].price.total).toBe(5_527_170); // inherits the design's weights
    expect(variants[1].price.total).toBe(5_839_627); // its own 4.4 g net
    expect(variants[0].attributes).toEqual({ size: "14" });
  });
});

describe("a design sold in sizes is bought BY size", () => {
  it("counts stock across its sizes — and never a piece nobody has sized", async () => {
    const s14 = await createProductVariant({ productId: shop.solitaire.id, sku: "SOL-1-S14", attributes: { size: "14" } });
    const s16 = await createProductVariant({ productId: shop.solitaire.id, sku: "SOL-1-S16", attributes: { size: "16" } });
    await stock(shop.solitaire.id); // an unsized piece
    const before = (await get("/products/solitaire-ring")).body.product;
    expect(before.availability.status).toBe("OUT_OF_STOCK"); // it cannot be sold online until it has a size
    expect(before.variants.every((v: { availability: { status: string } }) => v.availability.status === "OUT_OF_STOCK")).toBe(true);
    await stock(shop.solitaire.id, { variantId: s14.id });
    await stock(shop.solitaire.id, { variantId: s16.id });
    await stock(shop.solitaire.id, { variantId: s16.id });
    const after = (await get("/products/solitaire-ring")).body.product;
    expect(after.availability).toMatchObject({ status: "LOW_STOCK", remaining: 3 }); // 1 + 2, not 4
    expect(after.variants.map((v: { availability: { remaining?: number } }) => v.availability.remaining)).toEqual([1, 2]);
  });

  it("makes the card, the page and the listing agree", async () => {
    const s14 = await createProductVariant({ productId: shop.solitaire.id, sku: "SOL-1-S14", attributes: { size: "14" } });
    await stock(shop.solitaire.id, { variantId: s14.id });
    const inList = (await get("/products?q=solitaire")).body.items[0];
    const onPage = (await get("/products/solitaire-ring")).body.product;
    expect(inList.availability).toEqual(onPage.availability);
    expect(names(await get("/products?inStock=true"))).toContain("Solitaire Ring");
  });

  it("asks for a size when the bag has none for a sized design", async () => {
    const s14 = await createProductVariant({ productId: shop.solitaire.id, sku: "SOL-1-S14", attributes: { size: "14" } });
    await stock(shop.solitaire.id, { variantId: s14.id });
    const line = (await request(t.app).post("/api/store/cart/quote").send({ lines: [{ slug: "solitaire-ring", quantity: 1 }] })).body.lines[0];
    expect(line).toMatchObject({ maxQuantity: 0, lineTotal: null });
    expect(line.notes.join(" ")).toMatch(/choose a size/i);
  });
});

describe("browsing: filters, search, sorting, paging", () => {
  it("filters by category including its sub-categories", async () => {
    expect(names(await get("/products?category=necklaces"))).toEqual(["Kundan Choker"]); // the choker is a child of Necklaces
    expect(names(await get("/products?category=rings")).sort()).toEqual(["Plain Band", "Silver Ring", "Solitaire Ring"]);
    expect(names(await get("/products?category=nonexistent"))).toEqual([]);
  });
  it("filters by collection, metal and purity", async () => {
    expect(names(await get("/products?collection=bridal-edit")).sort()).toEqual(["Kundan Choker", "Solitaire Ring"]);
    expect(names(await get("/products?metal=SILVER"))).toEqual(["Silver Ring"]);
    expect(names(await get("/products?metal=silver"))).toEqual(["Silver Ring"]); // case-insensitive
    expect(names(await get("/products?purity=18K"))).toEqual(["Solitaire Ring"]);
  });
  it("filters to what is in stock", async () => {
    await stock(shop.band.id);
    expect(names(await get("/products?inStock=true"))).toEqual(["Plain Band"]);
  });
  it("filters by the LIVE price, and leaves out what has no price to compare", async () => {
    expect(names(await get("/products?minPrice=6000000&maxPrice=8000000"))).toEqual(["Plain Band"]);
    expect(names(await get("/products?minPrice=5000000")).sort()).toEqual(["Plain Band", "Solitaire Ring"]);
    expect(names(await get("/products?maxPrice=100"))).toEqual([]);
  });
  it("sorts by price both ways, with price-on-request pieces always last", async () => {
    expect(names(await get("/products?sort=price-asc")).slice(0, 2)).toEqual(["Solitaire Ring", "Plain Band"]);
    expect(names(await get("/products?sort=price-desc")).slice(0, 2)).toEqual(["Plain Band", "Solitaire Ring"]);
    for (const sort of ["price-asc", "price-desc"]) {
      const items = (await get(`/products?sort=${sort}`)).body.items as { price: StorePrice }[];
      const firstUnpriced = items.findIndex((i) => i.price.status !== "AVAILABLE");
      expect(items.slice(firstUnpriced).every((i) => i.price.status !== "AVAILABLE")).toBe(true);
    }
  });
  it("sorts newest first by default", async () => {
    expect((await get("/products")).body.items[0].name).toBe("Silver Ring");
  });
  it("sorts bestsellers by what has really sold, and not at all by claim", async () => {
    const a = await stock(shop.solitaire.id);
    const b = await stock(shop.solitaire.id);
    const c = await stock(shop.band.id);
    for (const item of [a, b, c]) await sellItems({ performedBy: someUser() }, { itemIds: [item.id], referenceType: "ORDER", referenceId: someOrder() });
    expect(names(await get("/products?sort=bestselling")).slice(0, 2)).toEqual(["Solitaire Ring", "Plain Band"]);
    expect((await get("/home")).body.bestsellers.map((p: { name: string }) => p.name)).toEqual(["Solitaire Ring", "Plain Band"]);
  });
  it("searches names, tags, SKUs, category and collection names", async () => {
    expect(names(await get("/products?q=solitaire"))).toEqual(["Solitaire Ring"]);
    expect(names(await get("/products?q=daily"))).toEqual(["Plain Band"]); // a tag
    expect(names(await get("/products?q=SLV-1"))).toEqual(["Silver Ring"]); // a SKU
    expect(names(await get("/products?q=necklaces"))).toEqual(["Kundan Choker"]); // a category
    expect(names(await get("/products?q=bridal")).sort()).toEqual(["Kundan Choker", "Solitaire Ring"]); // a collection
    expect(names(await get("/products?q=gold ring"))).toEqual([]); // every word must match
    expect(names(await get("/products?q=%5B.*"))).toEqual([]); // regex characters are literal
  });
  it("fetches specific products by slug (the wishlist)", async () => {
    expect(names(await get("/products?slugs=silver-ring,plain-band,not-a-product,b2b-only-bar")).sort()).toEqual(["Plain Band", "Silver Ring"]);
  });
  it("pages, reporting the total", async () => {
    const r = await get("/products?pageSize=2&page=2");
    expect(r.body).toMatchObject({ total: 5, page: 2, pageSize: 2 });
    expect(r.body.items).toHaveLength(2);
    expect((await get("/products?pageSize=2&page=3")).body.items).toHaveLength(1);
  });
  it("offers facets for the scope being browsed, not for the filters already chosen", async () => {
    const chosen = (await get("/products?metal=GOLD&purity=22K")).body.facets;
    expect(chosen.metals.map((m: { code: string }) => m.code)).toEqual(["GOLD", "SILVER"]); // Silver stays offered
    expect(chosen.purities).toEqual(["18K", "22K", "925"]);
    expect(chosen.price).toEqual({ min: 5_527_170, max: 7_632_300 }); // live prices of what is priced
    expect(chosen.categories.find((c: { slug: string }) => c.slug === "chokers")).toMatchObject({ parentSlug: "necklaces", count: 1 });
    const scoped = (await get("/products?category=rings")).body.facets;
    expect(scoped.metals.map((m: { code: string }) => m.code)).toEqual(["GOLD", "SILVER"]);
    expect(scoped.categories.map((c: { slug: string }) => c.slug)).toEqual(["rings"]);
  });
  it("rejects malformed queries", async () => {
    for (const q of ["sort=cheapest", "page=0", "pageSize=500", "minPrice=-1", "minPrice=9&maxPrice=1", "inStock=maybe", "category=Not%20A%20Slug"]) expect((await get(`/products?${q}`)).status, q).toBe(400);
  });
});

describe("navigation and home", () => {
  it("counts only shoppable products, rolls sub-categories into their parent, and uses real product images", async () => {
    const nav = (await get("/navigation")).body;
    const cat = (slug: string) => nav.categories.find((c: { slug: string }) => c.slug === slug);
    expect(cat("rings")).toMatchObject({ productCount: 3, image: { url: expect.stringContaining("/api/media/a1.png") } });
    expect(cat("necklaces")).toMatchObject({ productCount: 1 }); // the choker below it
    expect(cat("chokers")).toMatchObject({ productCount: 1, parentSlug: "necklaces" });
    expect(nav.collections).toEqual([expect.objectContaining({ slug: "bridal-edit", productCount: 2 })]);
  });
  it("hides an empty category", async () => {
    await createProductCategory({ name: "Empty Shelf" });
    expect((await get("/navigation")).body.categories.map((c: { slug: string }) => c.slug)).not.toContain("empty-shelf");
  });
  it("shows curated featured products and collections only for slugs that really exist, in the given order", async () => {
    await StorefrontContentModel.updateOne({ key: "default" }, { $set: { "content.featured": { collectionSlugs: ["bridal-edit", "ghost"], productSlugs: ["silver-ring", "ghost", "plain-band", "b2b-only-bar"] } } });
    const home = (await get("/home")).body;
    expect(home.featured.map((p: { name: string }) => p.name)).toEqual(["Silver Ring", "Plain Band"]);
    expect(home.collections.map((c: { slug: string }) => c.slug)).toEqual(["bridal-edit"]);
  });
  it("has nothing curated, and no bestsellers, until someone chooses or something sells — no invented rails", async () => {
    const home = (await get("/home")).body;
    expect(home.featured).toEqual([]);
    expect(home.collections).toEqual([]);
    expect(home.bestsellers).toEqual([]);
    expect(home.newArrivals.length).toBeGreaterThan(0);
  });
  it("marks a design new only within 30 days of being added", async () => {
    expect((await get("/products/plain-band")).body.product.isNew).toBe(true);
    expect((await laterStorefront().get("/api/store/products/plain-band")).body.product.isNew).toBe(false);
  });
});

/** A storefront whose clock is 60 days ahead, over the same database. */
function laterStorefront() {
  const app = express();
  const media = createMediaService(createMemoryStorage(), "http://api.test");
  app.use("/api/store", createStorefrontRouter({ storefront: createStorefrontService({ media, now: () => new Date(Date.now() + 60 * 86_400_000) }), writeLimiter: (_q, _s, next) => next() }));
  return request(app);
}

describe("product detail", () => {
  it("returns everything a product page needs", async () => {
    const p = (await get("/products/solitaire-ring")).body.product;
    expect(p).toMatchObject({
      sku: "SOL-1", name: "Solitaire Ring", slug: "solitaire-ring", metal: { code: "GOLD", name: "Gold" }, purity: "18K",
      category: { name: "Rings", slug: "rings" }, collections: [{ name: "Bridal Edit", slug: "bridal-edit" }],
      specs: { grossWeight: 4, netWeight: 3.9, stoneWeight: 0.1, stones: [{ name: "Diamond", caratWeight: 0.3, quantity: 1, quality: "VS1" }] },
    });
    expect(p.images).toEqual([{ url: expect.stringContaining("/api/media/a1.png"), alt: "Front" }, { url: expect.stringContaining("/api/media/a2.png"), alt: "Solitaire Ring" }]);
  });
  it("gives the category trail from the top, for breadcrumbs", async () => {
    expect((await get("/products/kundan-choker")).body.product.categoryTrail).toEqual([{ name: "Necklaces", slug: "necklaces" }, { name: "Chokers", slug: "chokers" }]);
  });
  it("omits weights it does not have rather than showing zero", async () => {
    expect((await get("/products/weightless-pendant")).body.product.specs).toEqual({ stones: [] });
  });
});

describe("cart quote — prices and stock re-checked on the server", () => {
  const quote = (lines: unknown[]) => request(t.app).post("/api/store/cart/quote").send({ lines });

  it("prices each line and totals the bag", async () => {
    await stock(shop.band.id); await stock(shop.band.id); await stock(shop.solitaire.id);
    const q = (await quote([{ slug: "plain-band", quantity: 2 }, { slug: "solitaire-ring", quantity: 1 }])).body;
    expect(q.lines[0]).toMatchObject({ slug: "plain-band", quantity: 2, maxQuantity: 2, lineTotal: 2 * 7_632_300 });
    expect(q.totals).toEqual({ taxableValue: 2 * 7_410_000 + 5_366_184, gst: 2 * 222_300 + 160_986, total: 2 * 7_632_300 + 5_527_170, complete: true });
    expect(Date.parse(q.quotedAt)).not.toBeNaN();
  });
  it("clamps a quantity to what can really be bought, and says so", async () => {
    await stock(shop.band.id); await stock(shop.band.id);
    const line = (await quote([{ slug: "plain-band", quantity: 5 }])).body.lines[0];
    expect(line).toMatchObject({ quantity: 2, maxQuantity: 2 });
    expect(line.notes.join(" ")).toMatch(/Only 2 available/);
  });
  it("leaves an unavailable piece out of the total", async () => {
    await stock(shop.band.id);
    const q = (await quote([{ slug: "plain-band", quantity: 1 }, { slug: "solitaire-ring", quantity: 1 }])).body;
    expect(q.lines[1]).toMatchObject({ maxQuantity: 0, lineTotal: null });
    expect(q.lines[1].notes.join(" ")).toMatch(/unavailable/i);
    expect(q.totals.total).toBe(7_632_300);
    expect(q.totals.complete).toBe(false);
  });
  it("marks the total incomplete when a piece is priced on request", async () => {
    await stock(shop.kundan.id);
    const q = (await quote([{ slug: "kundan-choker", quantity: 1 }])).body;
    expect(q.lines[0].lineTotal).toBeNull();
    expect(q.totals).toMatchObject({ total: 0, complete: false });
  });
  it("labels a chosen variant and prices it on its own weights", async () => {
    const v = await createProductVariant({ productId: shop.solitaire.id, sku: "SOL-1-S16", attributes: { size: "16" }, defaultGrossWeight: 4.5, defaultNetWeight: 4.4 });
    await stock(shop.solitaire.id, { variantId: v.id });
    const line = (await quote([{ slug: "solitaire-ring", variantSku: "sol-1-s16", quantity: 1 }])).body.lines[0];
    expect(line).toMatchObject({ variantSku: "SOL-1-S16", variantLabel: "16", lineTotal: 5_839_627 });
  });
  it("handles a piece that has gone, and a size that is no longer offered", async () => {
    const gone = (await quote([{ slug: "retired-ring", quantity: 1 }])).body.lines[0];
    expect(gone).toMatchObject({ name: "No longer available", maxQuantity: 0, lineTotal: null });
    await stock(shop.solitaire.id);
    const size = (await quote([{ slug: "solitaire-ring", variantSku: "NOPE", quantity: 1 }])).body.lines[0];
    expect(size.notes.join(" ")).toMatch(/no longer offered/);
  });
  it("trusts nothing the browser says about price", async () => {
    await stock(shop.band.id);
    const line = (await request(t.app).post("/api/store/cart/quote").send({ lines: [{ slug: "plain-band", quantity: 1, price: 1, unitPrice: 1, total: 1 }] })).body.lines[0];
    expect(line.unitPrice.total).toBe(7_632_300);
  });
  it.each([["no lines", []], ["a zero quantity", [{ slug: "plain-band", quantity: 0 }]], ["too many of one", [{ slug: "plain-band", quantity: 11 }]], ["a fractional quantity", [{ slug: "plain-band", quantity: 1.5 }]], ["a bad slug", [{ slug: "Not A Slug", quantity: 1 }]], ["31 lines", Array.from({ length: 31 }, () => ({ slug: "plain-band", quantity: 1 }))]])("rejects %s", async (_n, lines) => {
    expect((await quote(lines)).status).toBe(400);
  });
});

describe("content, reviews and the newsletter", () => {
  it("serves the written content, without the pricing configuration", async () => {
    await StorefrontContentModel.updateOne({ key: "default" }, { $set: { "content.tagline": "Live prices", "content.policies": { returns: "Seven days." } } });
    const c = (await get("/content")).body;
    expect(c).toMatchObject({ brandName: "Suvarna", tagline: "Live prices", policies: { returns: "Seven days." } });
    expect(c.pricing).toBeUndefined();
  });
  it("falls back to the company name and NO policy, promise or story when nothing is written", async () => {
    await StorefrontContentModel.deleteMany({});
    const c = (await get("/content")).body;
    expect(c.brandName).toBe("Suvarna Jewellers");
    expect(c.policies).toEqual({});
    expect(c.trust).toEqual([]);
    expect(c.hero).toBeUndefined();
    expect(c.story).toBeUndefined();
  });
  it("survives malformed stored content (treated as unwritten)", async () => {
    await StorefrontContentModel.updateOne({ key: "default" }, { $set: { content: { brandName: 5 } } });
    expect((await get("/content")).status).toBe(200);
  });
  it("has no reviews module, and says so instead of returning an empty list", async () => {
    expect((await get("/reviews")).body).toEqual({ status: "NOT_CONNECTED", requires: "Reviews module" });
  });
  it("records a newsletter address once, identically whether or not it was already there", async () => {
    const post = (email: string) => request(t.app).post("/api/store/newsletter").send({ email });
    const first = await post("Reader@Example.com");
    const again = await post("reader@example.com");
    expect([first.status, again.status]).toEqual([202, 202]);
    expect(first.body).toEqual(again.body);
    const rows = await NewsletterSubscriptionModel.find({}).lean();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ email: "reader@example.com", source: "storefront" });
  });
  it("rejects a bad address and offers no way to list subscribers", async () => {
    expect((await request(t.app).post("/api/store/newsletter").send({ email: "not-an-email" })).status).toBe(400);
    expect((await get("/newsletter")).status).toBe(404);
  });
  it("lists what a search engine should index — only live pages", async () => {
    const s = (await get("/sitemap")).body;
    expect(s.products.map((p: { slug: string }) => p.slug).sort()).toEqual(["kundan-choker", "plain-band", "silver-ring", "solitaire-ring", "weightless-pendant"]);
    expect(s.categories.map((c: { slug: string }) => c.slug).sort()).toEqual(["chokers", "necklaces", "rings"]);
    expect(s.collections.map((c: { slug: string }) => c.slug)).toEqual(["bridal-edit"]);
  });
});
