import type { CreateProductInput } from "@jewellery/validation";
import { createProductCategory } from "../src/modules/catalog/product-category.repository";
import { createProductCollection } from "../src/modules/catalog/product-collection.repository";
import { createProductVariant } from "../src/modules/catalog/product-variant.repository";
import { createProduct } from "../src/modules/catalog/product.repository";
import type { MediaService } from "../src/modules/media/media.service";
import { createMetal } from "../src/modules/metals/metal.repository";
import { TINTS, placeholderPng } from "./png";

/**
 * DEVELOPMENT ONLY — realistic Indian-jewellery catalogue data for exercising the ERP screens.
 * Nothing under src/ imports this; it is only reached from scripts/dev-memory.ts. It goes through
 * the same repositories the API uses, so it cannot create a state the app couldn't.
 */
if (process.env.NODE_ENV === "production") throw new Error("catalogue seed data must never load in production");

const METALS = [
  { code: "GOLD", name: "Gold", symbol: "Au", purities: [["24K", 0.999], ["22K", 0.916], ["18K", 0.75], ["14K", 0.585]] },
  { code: "SILVER", name: "Silver", symbol: "Ag", purities: [["999", 0.999], ["925", 0.925]] },
  { code: "PLATINUM", name: "Platinum", symbol: "Pt", purities: [["950", 0.95]] },
] as const;

/** name → [description, parent name?] */
const CATEGORIES: [string, string, string?][] = [
  ["Rings", "Solitaires, bands, cocktail and daily-wear rings"],
  ["Necklaces", "Chokers, long haars and layered necklaces"],
  ["Chokers", "Close-fitting necklaces for bridal and festive wear", "Necklaces"],
  ["Earrings", "Studs, jhumkas, chandbalis and hoops"],
  ["Jhumkas", "Traditional bell-shaped drops", "Earrings"],
  ["Bangles & Bracelets", "Bangles, kadas and link bracelets"],
  ["Pendants", "Pendants and lockets"],
  ["Mangalsutra", "Traditional and contemporary mangalsutras"],
  ["Nose Pins", "Studs and rings for the nose"],
  ["Anklets", "Payals and chain anklets"],
  ["Coins & Bars", "Investment-grade coins and bars"],
];

const COLLECTIONS: [string, string][] = [
  ["Bridal Edit", "Heirloom pieces for the wedding trousseau"],
  ["Akshaya Tritiya", "Auspicious buys for the festival"],
  ["Temple Jewellery", "South-Indian temple-style craftsmanship"],
  ["Everyday Essentials", "Light, durable pieces for daily wear"],
  ["Diamond Solitaires", "Certified solitaires in gold and platinum"],
  ["Men's Signature", "Kadas, chains and rings for men"],
  ["Gifting Under 25K", "Thoughtful gifts at friendly prices"],
];

type Spec = {
  sku: string;
  name: string;
  category: string;
  metal: "GOLD" | "SILVER" | "PLATINUM";
  purity: string;
  gross: number;
  collections?: string[];
  tags?: string[];
  b2c?: boolean;
  b2b?: boolean;
  active?: boolean;
  images?: number;
  video?: boolean;
  variants?: { suffix: string; attrs: Record<string, string>; gross?: number }[];
};

const ringSizes = ["12", "14", "16", "18"].map((s) => ({ suffix: `S${s}`, attrs: { size: s } }));
const bangleSizes = ["2.2", "2.4", "2.6", "2.8"].map((s) => ({ suffix: s.replace(".", ""), attrs: { size: s } }));

const SPECS: Spec[] = [
  { sku: "GLD-RNG-0001", name: "Rihaan Solitaire Ring", category: "Rings", metal: "GOLD", purity: "18K", gross: 4.2, collections: ["Diamond Solitaires", "Bridal Edit"], tags: ["diamond", "solitaire", "engagement"], b2c: true, b2b: true, images: 3, video: true, variants: ringSizes },
  { sku: "GLD-RNG-0002", name: "Temple Band Ring", category: "Rings", metal: "GOLD", purity: "22K", gross: 5.8, collections: ["Temple Jewellery"], tags: ["temple", "band"], b2c: true, images: 2, variants: ringSizes },
  { sku: "GLD-RNG-0003", name: "Aarohi Floral Cocktail Ring", category: "Rings", metal: "GOLD", purity: "18K", gross: 6.4, collections: ["Bridal Edit"], tags: ["floral", "cocktail", "ruby"], b2c: true, b2b: true, images: 2 },
  { sku: "GLD-RNG-0004", name: "Everyday Plain Band", category: "Rings", metal: "GOLD", purity: "22K", gross: 3.1, collections: ["Everyday Essentials", "Gifting Under 25K"], tags: ["plain", "band", "daily-wear"], b2c: true, b2b: true, images: 1, variants: ringSizes },
  { sku: "GLD-RNG-0005", name: "Rudra Men's Signet Ring", category: "Rings", metal: "GOLD", purity: "22K", gross: 9.6, collections: ["Men's Signature"], tags: ["men", "signet"], b2c: true, images: 2 },
  { sku: "PLT-RNG-0001", name: "Ishaan Platinum Couple Band", category: "Rings", metal: "PLATINUM", purity: "950", gross: 8.2, collections: ["Diamond Solitaires"], tags: ["platinum", "couple", "band"], b2c: true, b2b: true, images: 2, variants: ringSizes },
  { sku: "GLD-NCK-0001", name: "Kundan Bridal Necklace", category: "Necklaces", metal: "GOLD", purity: "22K", gross: 62.5, collections: ["Bridal Edit", "Temple Jewellery"], tags: ["kundan", "bridal", "heavy"], b2c: true, b2b: true, images: 3, video: true },
  { sku: "GLD-NCK-0002", name: "Lakshmi Coin Long Haar", category: "Necklaces", metal: "GOLD", purity: "22K", gross: 48.3, collections: ["Temple Jewellery", "Akshaya Tritiya"], tags: ["lakshmi", "coin", "haar"], b2c: true, b2b: true, images: 2 },
  { sku: "GLD-NCK-0003", name: "Mayura Peacock Necklace", category: "Necklaces", metal: "GOLD", purity: "22K", gross: 55.1, collections: ["Temple Jewellery", "Bridal Edit"], tags: ["peacock", "temple", "enamel"], b2b: true, images: 2 },
  { sku: "GLD-NCK-0004", name: "Minimal Layered Chain", category: "Necklaces", metal: "GOLD", purity: "18K", gross: 7.8, collections: ["Everyday Essentials"], tags: ["chain", "layered", "minimal"], b2c: true, images: 1 },
  { sku: "GLD-CHK-0001", name: "Polki Bridal Choker", category: "Chokers", metal: "GOLD", purity: "22K", gross: 38.4, collections: ["Bridal Edit"], tags: ["polki", "choker", "bridal"], b2c: true, b2b: true, images: 3 },
  { sku: "GLD-CHK-0002", name: "Antique Temple Choker", category: "Chokers", metal: "GOLD", purity: "22K", gross: 34.2, collections: ["Temple Jewellery"], tags: ["antique", "temple", "choker"], b2b: true, images: 2 },
  { sku: "GLD-EAR-0001", name: "Classic Diamond Studs", category: "Earrings", metal: "GOLD", purity: "18K", gross: 2.6, collections: ["Diamond Solitaires", "Gifting Under 25K"], tags: ["diamond", "studs"], b2c: true, b2b: true, images: 2 },
  { sku: "GLD-EAR-0002", name: "Chandbali Pearl Drops", category: "Earrings", metal: "GOLD", purity: "22K", gross: 14.7, collections: ["Bridal Edit"], tags: ["chandbali", "pearl"], b2c: true, images: 2 },
  { sku: "GLD-EAR-0003", name: "Everyday Gold Hoops", category: "Earrings", metal: "GOLD", purity: "18K", gross: 3.4, collections: ["Everyday Essentials", "Gifting Under 25K"], tags: ["hoops", "daily-wear"], b2c: true, b2b: true, images: 1 },
  { sku: "GLD-JHK-0001", name: "Temple Jhumka Large", category: "Jhumkas", metal: "GOLD", purity: "22K", gross: 18.9, collections: ["Temple Jewellery", "Akshaya Tritiya"], tags: ["jhumka", "temple"], b2c: true, b2b: true, images: 2, video: true },
  { sku: "GLD-JHK-0002", name: "Antique Ruby Jhumka", category: "Jhumkas", metal: "GOLD", purity: "22K", gross: 16.2, collections: ["Bridal Edit"], tags: ["jhumka", "ruby", "antique"], b2c: true, images: 2 },
  { sku: "GLD-JHK-0003", name: "Mini Jhumka Studs", category: "Jhumkas", metal: "GOLD", purity: "22K", gross: 5.1, collections: ["Gifting Under 25K"], tags: ["jhumka", "mini"], b2c: true, b2b: true, images: 1 },
  { sku: "GLD-BNG-0001", name: "Classic Gold Bangle", category: "Bangles & Bracelets", metal: "GOLD", purity: "22K", gross: 22.4, collections: ["Akshaya Tritiya", "Bridal Edit"], tags: ["bangle", "classic", "plain"], b2c: true, b2b: true, images: 2, variants: bangleSizes.map((v) => ({ ...v, gross: 22.4 })) },
  { sku: "GLD-BNG-0002", name: "Diamond-Cut Kada", category: "Bangles & Bracelets", metal: "GOLD", purity: "22K", gross: 31.6, collections: ["Men's Signature"], tags: ["kada", "men", "diamond-cut"], b2c: true, images: 2, variants: bangleSizes },
  { sku: "GLD-BNG-0003", name: "Filigree Bangle Pair", category: "Bangles & Bracelets", metal: "GOLD", purity: "22K", gross: 41.0, collections: ["Bridal Edit", "Temple Jewellery"], tags: ["filigree", "pair", "bridal"], b2b: true, images: 2, variants: bangleSizes },
  { sku: "GLD-BNG-0004", name: "Link Bracelet 18K", category: "Bangles & Bracelets", metal: "GOLD", purity: "18K", gross: 9.3, collections: ["Everyday Essentials"], tags: ["bracelet", "link"], b2c: true, b2b: true, images: 1 },
  { sku: "GLD-PND-0001", name: "Om Pendant", category: "Pendants", metal: "GOLD", purity: "22K", gross: 4.5, collections: ["Gifting Under 25K", "Akshaya Tritiya"], tags: ["om", "religious"], b2c: true, b2b: true, images: 1 },
  { sku: "GLD-PND-0002", name: "Solitaire Drop Pendant", category: "Pendants", metal: "GOLD", purity: "18K", gross: 2.9, collections: ["Diamond Solitaires"], tags: ["diamond", "solitaire"], b2c: true, images: 2 },
  { sku: "GLD-PND-0003", name: "Ganesha Pendant", category: "Pendants", metal: "GOLD", purity: "22K", gross: 6.2, collections: ["Akshaya Tritiya"], tags: ["ganesha", "religious"], b2c: true, b2b: true, images: 1 },
  { sku: "GLD-MNG-0001", name: "Traditional Black-Bead Mangalsutra", category: "Mangalsutra", metal: "GOLD", purity: "22K", gross: 16.8, collections: ["Bridal Edit"], tags: ["mangalsutra", "traditional"], b2c: true, b2b: true, images: 2 },
  { sku: "GLD-MNG-0002", name: "Diamond Bracelet Mangalsutra", category: "Mangalsutra", metal: "GOLD", purity: "18K", gross: 8.4, collections: ["Diamond Solitaires", "Everyday Essentials"], tags: ["mangalsutra", "diamond", "bracelet"], b2c: true, images: 2 },
  { sku: "GLD-NSP-0001", name: "Diamond Nose Pin", category: "Nose Pins", metal: "GOLD", purity: "18K", gross: 0.9, collections: ["Gifting Under 25K"], tags: ["nose-pin", "diamond"], b2c: true, b2b: true, images: 1 },
  { sku: "GLD-NSP-0002", name: "Traditional Nath", category: "Nose Pins", metal: "GOLD", purity: "22K", gross: 7.6, collections: ["Bridal Edit"], tags: ["nath", "bridal"], b2b: true, images: 1 },
  { sku: "SLV-ANK-0001", name: "Silver Payal Pair", category: "Anklets", metal: "SILVER", purity: "925", gross: 38.0, collections: ["Gifting Under 25K"], tags: ["payal", "silver"], b2c: true, b2b: true, images: 2 },
  { sku: "SLV-ANK-0002", name: "Ghungroo Anklet", category: "Anklets", metal: "SILVER", purity: "925", gross: 26.5, collections: ["Gifting Under 25K", "Temple Jewellery"], tags: ["ghungroo", "silver"], b2c: true, images: 1 },
  { sku: "SLV-RNG-0001", name: "Oxidised Silver Ring", category: "Rings", metal: "SILVER", purity: "925", gross: 6.8, collections: ["Everyday Essentials", "Gifting Under 25K"], tags: ["oxidised", "silver"], b2c: true, b2b: true, images: 1, variants: ringSizes },
  { sku: "SLV-BNG-0001", name: "Silver Kada", category: "Bangles & Bracelets", metal: "SILVER", purity: "925", gross: 34.0, collections: ["Men's Signature"], tags: ["kada", "silver"], b2c: true, images: 1 },
  { sku: "GLD-CIN-0001", name: "Gold Coin 10 g", category: "Coins & Bars", metal: "GOLD", purity: "24K", gross: 10, collections: ["Akshaya Tritiya"], tags: ["coin", "investment", "bis-hallmarked"], b2c: true, b2b: true, images: 1 },
  { sku: "GLD-CIN-0002", name: "Gold Bar 50 g", category: "Coins & Bars", metal: "GOLD", purity: "24K", gross: 50, tags: ["bar", "investment"], b2b: true, images: 1 },
  { sku: "SLV-CIN-0001", name: "Silver Coin 50 g", category: "Coins & Bars", metal: "SILVER", purity: "999", gross: 50, collections: ["Akshaya Tritiya", "Gifting Under 25K"], tags: ["coin", "silver", "investment"], b2c: true, b2b: true, images: 1 },
  // Not yet live, and retired, so status filters/badges have something to show.
  { sku: "GLD-NCK-0090", name: "Lotus Rani Haar (Draft)", category: "Necklaces", metal: "GOLD", purity: "22K", gross: 71.0, tags: ["draft", "lotus"], images: 0 },
  { sku: "GLD-EAR-0091", name: "Retired Coin Earrings", category: "Earrings", metal: "GOLD", purity: "22K", gross: 9.8, collections: ["Temple Jewellery"], tags: ["coin", "retired"], active: false, images: 1 },
  { sku: "GLD-RNG-0092", name: "Retired Cocktail Ring", category: "Rings", metal: "GOLD", purity: "18K", gross: 7.0, tags: ["cocktail", "retired"], active: false, images: 0 },
];

const DESCRIPTIONS: Record<string, string> = {
  Rings: "Handcrafted in BIS-hallmarked gold with a comfortable, polished finish.",
  Necklaces: "A statement piece finished by our master karigars — made to be passed down.",
  Chokers: "Sits close at the collarbone; designed to layer with a longer haar for bridal wear.",
  Earrings: "Light enough for all-day wear, finished with secure butterfly backs.",
  Jhumkas: "Traditional bell-shaped drops with fine granulation work.",
  "Bangles & Bracelets": "Sized to sit comfortably; available in the sizes listed under variants.",
  Pendants: "Comes on request with a matching chain.",
  Mangalsutra: "Traditional design with contemporary comfort.",
  "Nose Pins": "Secure screw or push back, hallmarked.",
  Anklets: "Sold as a pair.",
  "Coins & Bars": "999 fineness, sealed and hallmarked. Priced daily on the metal rate.",
};

export interface SeedResult {
  metals: number;
  categories: number;
  collections: number;
  products: number;
  variants: number;
  images: number;
}

export async function seedCatalog(media: MediaService): Promise<SeedResult> {
  const metalIds = new Map<string, string>();
  for (const m of METALS) {
    const metal = await createMetal({ code: m.code, name: m.name, symbol: m.symbol, purityOptions: m.purities.map(([code, fineness]) => ({ code, fineness, isActive: true })) });
    metalIds.set(m.code, metal.id);
  }

  const categoryIds = new Map<string, string>();
  for (const [name, description, parent] of CATEGORIES) {
    const c = await createProductCategory({ name, description, parentId: parent ? categoryIds.get(parent) : undefined });
    categoryIds.set(name, c.id);
  }

  const collectionIds = new Map<string, string>();
  for (const [name, description] of COLLECTIONS) collectionIds.set(name, (await createProductCollection({ name, description })).id);

  let variants = 0;
  let images = 0;
  for (const s of SPECS) {
    const keys: { key: string; alt: string }[] = [];
    for (let i = 0; i < (s.images ?? 0); i++) {
      const { key } = await media.uploadImage(placeholderPng(TINTS[s.metal]!, i));
      keys.push({ key, alt: `${s.name} — view ${i + 1}` });
    }
    images += keys.length;
    const input: CreateProductInput = {
      sku: s.sku,
      name: s.name,
      description: `${s.name}. ${DESCRIPTIONS[s.category] ?? ""}`.trim(),
      categoryId: categoryIds.get(s.category),
      collectionIds: (s.collections ?? []).map((c) => collectionIds.get(c)!),
      metalId: metalIds.get(s.metal)!,
      purity: s.purity,
      defaultGrossWeight: s.gross,
      defaultNetWeight: Math.round(s.gross * 0.96 * 1000) / 1000, // a little stone/finding allowance, deterministic
      images: keys,
      videos: s.video ? [`https://videos.example.com/catalogue/${s.sku.toLowerCase()}`] : [],
      tags: s.tags ?? [],
      b2cEnabled: s.b2c ?? false,
      b2bEnabled: s.b2b ?? false,
      isActive: s.active ?? true,
    };
    const product = await createProduct(input);
    for (const v of s.variants ?? []) {
      await createProductVariant({ productId: product.id, sku: `${s.sku}-${v.suffix}`, attributes: v.attrs, defaultGrossWeight: v.gross });
      variants++;
    }
  }
  return { metals: METALS.length, categories: CATEGORIES.length, collections: COLLECTIONS.length, products: SPECS.length, variants, images };
}
