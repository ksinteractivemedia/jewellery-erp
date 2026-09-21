import { createTaxRule } from "../src/modules/compliance/tax-rule.repository";
import { findProductBySku, updateProduct } from "../src/modules/catalog/product.repository";
import { StorefrontContentModel } from "../src/modules/storefront/storefront-content.model";
import { ProductCollectionModel } from "../src/modules/catalog/product-collection.model";
import { ProductModel } from "../src/modules/catalog/product.model";
import { InventoryItemModel } from "../src/modules/inventory/inventory-item.model";

/**
 * DEVELOPMENT ONLY — what a merchandiser would enter for the storefront, so its layout and its honest states can be
 * exercised: a GST rule, editorial copy and curation, and stones on a few designs. THE COPY BELOW IS SAMPLE TEXT, not
 * the business's policies: a real deployment writes its own (there is no editing screen yet), and the storefront shows a
 * section only when someone has written it. Goes through the same repositories the API uses; nothing under src/ imports it.
 */
if (process.env.NODE_ENV === "production") throw new Error("storefront seed data must never load in production");

/** [sku, stones, stone value in paise | undefined, net weight]. One design deliberately has stones but no value, so "price on request" is visible. */
const STONE_DESIGNS: [string, { name: string; caratWeight: number; quantity: number; quality?: string }[], number | undefined, number][] = [
  ["GLD-RNG-0001", [{ name: "Diamond", caratWeight: 0.3, quantity: 1, quality: "VS1 · G" }], 4_200_000, 4.14],
  ["GLD-RNG-0003", [{ name: "Ruby", caratWeight: 0.5, quantity: 1, quality: "Natural" }, { name: "Diamond", caratWeight: 0.12, quantity: 14, quality: "VS · GH" }], 1_800_000, 6.3],
  ["GLD-CHK-0001", [{ name: "Polki diamond", caratWeight: 3.0, quantity: 42, quality: "Uncut" }], 9_500_000, 37.8],
  ["GLD-NCK-0001", [{ name: "Kundan polki", caratWeight: 8.0, quantity: 60 }], undefined, 61.3], // no value on purpose
];

export async function seedStorefront(): Promise<{ stoneDesigns: number }> {
  await createTaxRule({ name: "GST on jewellery (development seed)", hsnCode: "7113", intraState: { cgst: 1.5, sgst: 1.5 }, interState: { igst: 3 }, validFrom: new Date("2020-01-01") });

  let stoneDesigns = 0;
  for (const [sku, stoneDetails, stoneValue, defaultNetWeight] of STONE_DESIGNS) {
    const p = await findProductBySku(sku);
    if (!p) continue;
    await updateProduct(p.id, { stoneDetails, defaultNetWeight, ...(stoneValue !== undefined ? { stoneValue } : {}) });
    stoneDesigns++;
  }

  const [collections, products] = await Promise.all([
    ProductCollectionModel.find({}).select("slug").lean(),
    ProductModel.find({ isActive: true, b2cEnabled: true, "images.0": { $exists: true } }).sort({ sku: 1 }).select("slug sku").lean(),
  ]);
  const slugOf = (name: string) => collections.find((c) => c.slug === name)?.slug;
  const featuredCollections = ["bridal-edit", "temple-jewellery", "everyday-essentials", "diamond-solitaires"].map(slugOf).filter((s): s is string => Boolean(s));
  // Curate what can actually be bought: designs with a photograph and a sellable piece in stock, spread across metals.
  const inStock = new Set((await InventoryItemModel.distinct("productId", { status: "AVAILABLE", reservation: { $exists: false }, quantity: { $gt: 0 } })).map(String));
  const buyable = products.filter((p) => inStock.has(String(p._id)));
  const pick = (prefix: string) => buyable.find((p) => p.sku.startsWith(prefix))?.slug;
  const featuredProducts = [pick("GLD-RNG"), pick("GLD-NCK"), pick("GLD-CHK"), pick("SLV-"), pick("GLD-CIN"), pick("PLT-"), ...buyable.map((p) => p.slug)].filter((s, i, a): s is string => Boolean(s) && a.indexOf(s) === i).slice(0, 6);

  await StorefrontContentModel.create({
    key: "default",
    content: {
      brandName: "Suvarna",
      tagline: "Fine jewellery, priced live against today's metal rate.",
      announcements: [{ text: "Prices move with the gold rate — the price you see is calculated now.", href: "/collections" }],
      hero: {
        eyebrow: "The Bridal Edit",
        title: "Heirlooms, made to be handed down",
        subtitle: "Handcrafted gold and diamond jewellery, each piece priced transparently from the day's metal rate.",
        ctaLabel: "Explore the collection",
        ctaHref: "/collections/bridal-edit",
      },
      story: {
        eyebrow: "Craftsmanship",
        title: "Made by hand, finished by eye",
        body: [
          "Every piece begins as a design and passes through the hands of our karigars — casting, setting and polishing — before it is checked, weighed and hallmarked.",
          "We show you how a price is built: the metal at today's rate, the making, the stones, and GST. Nothing is hidden inside a tag price.",
        ],
        ctaLabel: "See what we make",
        ctaHref: "/collections",
      },
      trust: [
        { icon: "hallmark", title: "Hallmarked gold", text: "Pieces carry a HUID, shown on each product when it applies." },
        { icon: "certified", title: "Transparent pricing", text: "Metal, making, stones and GST, itemised." },
        { icon: "shipping", title: "Insured shipping", text: "Sealed and insured in transit." },
        { icon: "returns", title: "Easy returns", text: "Read our returns policy on every product page." },
      ],
      policies: {
        shipping: "Every order is packed sealed and shipped insured. Delivery times depend on your pin code and are confirmed at checkout.",
        returns: "Unworn pieces in original condition can be returned within 7 days of delivery. Made-to-order and customised pieces are not returnable. (Sample text — set your own policy.)",
        care: "Store each piece separately in its pouch, away from moisture. Put jewellery on after perfume and cosmetics, and wipe gently with a soft dry cloth. Have gold checked and cleaned by a jeweller once a year.",
        delivery: "Dispatched in 3–5 working days (sample text).",
      },
      featured: { collectionSlugs: featuredCollections, productSlugs: featuredProducts },
      pricing: { hsnCode: "7113" },
      contact: { email: "care@suvarna.example", phone: "+91 22 0000 0000" },
      // Sample delivery terms — the business sets its own.
      deliveryOptions: [
        { code: "insured-standard", label: "Insured standard delivery", fee: 0, estimate: "5–7 working days (sample)" },
        { code: "insured-express", label: "Insured express delivery", fee: 150000, estimate: "2–3 working days (sample)" },
      ],
    },
  });
  return { stoneDesigns };
}
