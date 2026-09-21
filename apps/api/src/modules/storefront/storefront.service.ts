import { Types } from "mongoose";
import type {
  StoreAvailability,
  StoreCartLine,
  StoreCartQuote,
  StoreCategoryNode,
  StoreCollectionNode,
  StoreContent,
  StoreFacets,
  StoreHome,
  StoreImage,
  StoreListResult,
  StoreNavigation,
  StorePrice,
  StoreProductCard,
  StoreProductDetail,
} from "@jewellery/types";
import { storefrontContentSchema, type StoreCartQuoteInput, type StoreListQuery } from "@jewellery/validation";
import { NotFoundError } from "../../shared/errors";
import { ProductCategoryModel } from "../catalog/product-category.model";
import { ProductCollectionModel } from "../catalog/product-collection.model";
import { ProductVariantModel } from "../catalog/product-variant.model";
import { ProductModel } from "../catalog/product.model";
import { InventoryItemModel } from "../inventory/inventory-item.model";
import { InventoryLedgerModel } from "../inventory/inventory-ledger.model";
import type { MediaService } from "../media/media.service";
import { CompanyModel } from "../organization/company.model";
import { NewsletterSubscriptionModel } from "./newsletter.model";
import { StorefrontContentModel } from "./storefront-content.model";
import { loadPricingWorld, priceDesign, type PricingWorld } from "./storefront-pricing";

const DAY_MS = 86_400_000;
const NEW_DAYS = 30;
const BESTSELLER_DAYS = 180;
const LOW_STOCK_AT = 3;
const id = (v: unknown) => String(v);

type ProductLean = {
  _id: Types.ObjectId;
  sku: string;
  name: string;
  slug: string;
  description?: string;
  categoryId?: Types.ObjectId;
  collectionIds: Types.ObjectId[];
  metalId: Types.ObjectId;
  purity?: string;
  defaultGrossWeight?: number;
  defaultNetWeight?: number;
  stoneDetails: { name: string; caratWeight: number; quantity: number; quality?: string }[];
  stoneValue?: number;
  images: { key: string; alt?: string }[];
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
};
type Stock = { count: number; withHuid: number };
/** A variant's attributes, whether Mongoose handed back a Map or (for lean reads) a plain object. */
const attrsOf = (v: { attributes?: unknown }): Record<string, string> => Object.fromEntries(v.attributes instanceof Map ? v.attributes : Object.entries((v.attributes ?? {}) as object));

/** The public storefront: read-only catalogue, live prices, cart quotes and a newsletter list. Nothing here changes stock or takes an order. */
export function createStorefrontService(deps: { media: MediaService; now?: () => Date }) {
  const { media } = deps;
  const clock = deps.now ?? (() => new Date());

  const image = (p: Pick<ProductLean, "images" | "name">, i = 0): StoreImage | undefined => {
    const img = p.images[i];
    return img ? { url: media.urlFor(img.key), alt: img.alt ?? p.name } : undefined;
  };

  // ---- world: everything the request needs, loaded once ---------------------------------------
  async function content(): Promise<{ public: StoreContent; hsnCode: string | null }> {
    const [doc, company] = await Promise.all([StorefrontContentModel.findOne({ key: "default" }).lean(), CompanyModel.findOne({ isActive: true }).sort({ createdAt: 1 }).select("name").lean()]);
    const parsed = doc ? storefrontContentSchema.safeParse(doc.content) : null;
    const c = parsed?.success ? parsed.data : null;
    const { pricing, ...visible } = c ?? { brandName: company?.name ?? "Jewellery", announcements: [], trust: [], policies: {}, featured: { collectionSlugs: [], productSlugs: [] } };
    return { public: { ...visible, brandName: visible.brandName ?? company?.name ?? "Jewellery" } as StoreContent, hsnCode: (pricing as { hsnCode?: string } | undefined)?.hsnCode ?? null };
  }

  async function world() {
    const now = clock();
    const c = await content();
    const [pricing, categories, collections, stock, sold, activeVariants] = await Promise.all([
      loadPricingWorld(now, c.hsnCode),
      ProductCategoryModel.find({ isActive: true }).lean(),
      ProductCollectionModel.find({ isActive: true }).lean(),
      InventoryItemModel.aggregate<{ _id: { productId: unknown; variantId: unknown }; count: number; withHuid: number }>([
        // Sellable right now: finished jewellery, AVAILABLE, not reserved, something in it.
        { $match: { status: "AVAILABLE", type: "FINISHED_JEWELLERY", reservation: { $exists: false }, quantity: { $gt: 0 }, productId: { $exists: true } } },
        { $group: { _id: { productId: "$productId", variantId: { $ifNull: ["$variantId", null] } }, count: { $sum: 1 }, withHuid: { $sum: { $cond: [{ $ne: [{ $ifNull: ["$huid", null] }, null] }, 1, 0] } } } },
      ]),
      // Bestsellers are what has really sold: SALE entries in the ledger, by product, over the trailing window.
      InventoryLedgerModel.aggregate<{ _id: unknown; sold: number }>([
        { $match: { movementType: "SALE", createdAt: { $gte: new Date(now.getTime() - BESTSELLER_DAYS * DAY_MS) } } },
        { $lookup: { from: InventoryItemModel.collection.name, localField: "itemId", foreignField: "_id", as: "item" } },
        { $unwind: "$item" },
        { $match: { "item.productId": { $exists: true } } },
        { $group: { _id: "$item.productId", sold: { $sum: 1 } } },
      ]),
      ProductVariantModel.find({ isActive: true }).select("productId").lean(),
    ]);
    const byProduct = new Map<string, Stock>();
    const byVariant = new Map<string, Stock>();
    for (const g of stock) {
      const p = id(g._id.productId);
      const cur = byProduct.get(p) ?? { count: 0, withHuid: 0 };
      byProduct.set(p, { count: cur.count + g.count, withHuid: cur.withHuid + g.withHuid });
      if (g._id.variantId) byVariant.set(`${p}:${id(g._id.variantId)}`, { count: g.count, withHuid: g.withHuid });
    }
    const variantIds = new Map<string, string[]>();
    for (const v of activeVariants) variantIds.set(id(v.productId), [...(variantIds.get(id(v.productId)) ?? []), id(v._id)]);
    /**
     * What can be bought of a design. A design offered in sizes is bought BY size, so its stock is the sum over its sizes: a piece
     * nobody has sized cannot be sold online (the shopper must choose one). This keeps the card, the product page and the bag
     * from ever disagreeing about whether something is available.
     */
    const productStock = (productId: string): Stock | undefined => {
      const sizes = variantIds.get(productId);
      if (!sizes) return byProduct.get(productId);
      return sizes.reduce<Stock>((t, vid) => { const v = byVariant.get(`${productId}:${vid}`); return { count: t.count + (v?.count ?? 0), withHuid: t.withHuid + (v?.withHuid ?? 0) }; }, { count: 0, withHuid: 0 });
    };
    return {
      now,
      content: c.public,
      pricing,
      categories: new Map(categories.map((x) => [id(x._id), x])),
      collections: new Map(collections.map((x) => [id(x._id), x])),
      byProduct,
      byVariant,
      hasSizes: (productId: string) => variantIds.has(productId),
      productStock,
      sold: new Map(sold.map((s) => [id(s._id), s.sold])),
    };
  }
  type World = Awaited<ReturnType<typeof world>>;

  const availability = (s: Stock | undefined): StoreAvailability => {
    const count = s?.count ?? 0;
    const hallmarked = count > 0 && (s?.withHuid ?? 0) === count;
    if (count === 0) return { status: "OUT_OF_STOCK", hallmarked: false };
    return count <= LOW_STOCK_AT ? { status: "LOW_STOCK", remaining: count, hallmarked } : { status: "IN_STOCK", hallmarked };
  };

  const priceOf = (w: World, p: ProductLean, weights?: { gross?: number; net?: number }): StorePrice =>
    priceDesign(w.pricing, {
      metalId: id(p.metalId),
      purity: p.purity,
      grossWeight: weights?.gross ?? p.defaultGrossWeight,
      netWeight: weights?.net ?? weights?.gross ?? p.defaultNetWeight,
      hasStones: p.stoneDetails.length > 0,
      stoneValue: p.stoneValue,
      ...(p.categoryId ? { categoryId: id(p.categoryId) } : {}),
    });

  const card = (w: World, p: ProductLean): StoreProductCard => {
    const metal = w.pricing.metals.get(id(p.metalId));
    const cat = p.categoryId ? w.categories.get(id(p.categoryId)) : undefined;
    return {
      id: id(p._id),
      slug: p.slug,
      name: p.name,
      image: image(p, 0),
      altImage: image(p, 1),
      ...(metal ? { metal: { code: metal.code, name: metal.name } } : {}),
      ...(p.purity ? { purity: p.purity } : {}),
      ...(cat ? { category: { name: cat.name, slug: cat.slug } } : {}),
      price: priceOf(w, p),
      availability: availability(w.productStock(id(p._id))),
      isNew: w.now.getTime() - p.createdAt.getTime() < NEW_DAYS * DAY_MS,
    };
  };

  /** A category plus every descendant. */
  const withDescendants = (w: World, rootId: string): string[] => {
    const out = [rootId];
    for (let i = 0; i < out.length; i++) for (const c of w.categories.values()) if (c.parentId && id(c.parentId) === out[i] && !out.includes(id(c._id))) out.push(id(c._id));
    return out;
  };

  const LIVE = { isActive: true, b2cEnabled: true } as const;
  const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  return {
    /** Editorial content + the parts of it the browser needs everywhere (announcement, footer, trust). */
    async content(): Promise<StoreContent> {
      return (await content()).public;
    },

    async navigation(): Promise<StoreNavigation> {
      const w = await world();
      const products = (await ProductModel.find(LIVE).select("categoryId collectionIds images name").lean()) as unknown as ProductLean[];
      const own = new Map<string, number>();
      const coll = new Map<string, { n: number; img?: StoreImage }>();
      const catImg = new Map<string, StoreImage>();
      for (const p of products) {
        if (p.categoryId) {
          own.set(id(p.categoryId), (own.get(id(p.categoryId)) ?? 0) + 1);
          const img = image(p);
          // The category's picture is the first real product image found in it or beneath it.
          if (img) for (let c: string | undefined = id(p.categoryId); c; c = w.categories.get(c)?.parentId ? id(w.categories.get(c)!.parentId) : undefined) if (!catImg.has(c)) catImg.set(c, img);
        }
        for (const cid of p.collectionIds) {
          const cur = coll.get(id(cid)) ?? { n: 0 };
          coll.set(id(cid), { n: cur.n + 1, img: cur.img ?? image(p) });
        }
      }
      const total = (cid: string) => withDescendants(w, cid).reduce((n, x) => n + (own.get(x) ?? 0), 0);
      const categories: StoreCategoryNode[] = [...w.categories.values()]
        .map((c) => ({
          id: id(c._id), name: c.name, slug: c.slug, ...(c.description ? { description: c.description } : {}),
          ...(c.parentId && w.categories.get(id(c.parentId)) ? { parentSlug: w.categories.get(id(c.parentId))!.slug } : {}),
          productCount: total(id(c._id)), ...(catImg.get(id(c._id)) ? { image: catImg.get(id(c._id)) } : {}),
        }))
        .filter((c) => c.productCount > 0)
        .sort((a, b) => a.name.localeCompare(b.name));
      const collections: StoreCollectionNode[] = [...w.collections.values()]
        .map((c) => ({ id: id(c._id), name: c.name, slug: c.slug, ...(c.description ? { description: c.description } : {}), productCount: coll.get(id(c._id))?.n ?? 0, ...(coll.get(id(c._id))?.img ? { image: coll.get(id(c._id))!.img } : {}) }))
        .filter((c) => c.productCount > 0)
        .sort((a, b) => a.name.localeCompare(b.name));
      return { categories, collections };
    },

    async list(q: StoreListQuery): Promise<StoreListResult> {
      const w = await world();
      // The browsing scope: what the shopper is looking within (a category, a collection, a search, a set of slugs).
      const and: Record<string, unknown>[] = [];
      const scope: Record<string, unknown> = { ...LIVE };
      if (q.slugs?.length) scope.slug = { $in: q.slugs };
      if (q.category) {
        const cat = [...w.categories.values()].find((c) => c.slug === q.category);
        scope.categoryId = { $in: cat ? withDescendants(w, id(cat._id)).map((x) => new Types.ObjectId(x)) : [] };
      }
      if (q.collection) {
        const col = [...w.collections.values()].find((c) => c.slug === q.collection);
        scope.collectionIds = col ? col._id : { $in: [] };
      }
      for (const word of (q.q ?? "").split(/\s+/).filter(Boolean).slice(0, 5)) {
        const re = new RegExp(escapeRegex(word), "i");
        // A category name matches everything beneath it too: "necklaces" finds the chokers.
        const catIds = [...w.categories.values()].filter((c) => re.test(c.name)).flatMap((c) => withDescendants(w, id(c._id))).map((x) => new Types.ObjectId(x));
        const colIds = [...w.collections.values()].filter((c) => re.test(c.name)).map((c) => c._id);
        and.push({ $or: [{ name: re }, { sku: re }, { tags: re }, { categoryId: { $in: catIds } }, { collectionIds: { $in: colIds } }] });
      }
      if (and.length) scope.$and = and;

      // Refinements on top of the scope. Facets are drawn from the scope alone, so choosing "Gold" doesn't make "Silver" vanish from the menu.
      const filter: Record<string, unknown> = { ...scope };
      if (q.metal) {
        const m = [...w.pricing.metals.values()].find((x) => x.code === q.metal);
        filter.metalId = m ? new Types.ObjectId(m.id) : { $in: [] };
      }
      if (q.purity) filter.purity = q.purity;
      const [candidates, scoped] = (await Promise.all([ProductModel.find(filter).limit(2000).lean(), ProductModel.find(scope).limit(2000).lean()])) as unknown as [ProductLean[], ProductLean[]];

      let cards = candidates.map((p) => ({ p, c: card(w, p) }));
      if (q.inStock) cards = cards.filter((x) => x.c.availability.status !== "OUT_OF_STOCK");
      const priceOfCard = (c: StoreProductCard) => (c.price.status === "AVAILABLE" ? c.price.total : null);
      if (q.minPrice !== undefined || q.maxPrice !== undefined) {
        cards = cards.filter((x) => { const t = priceOfCard(x.c); return t !== null && (q.minPrice === undefined || t >= q.minPrice) && (q.maxPrice === undefined || t <= q.maxPrice); });
      }
      const created = (p: ProductLean) => p.createdAt.getTime();
      const byNewest = (a: { p: ProductLean }, b: { p: ProductLean }) => created(b.p) - created(a.p) || a.p.name.localeCompare(b.p.name);
      cards.sort((a, b) => {
        if (q.sort === "price-asc" || q.sort === "price-desc") {
          const [x, y] = [priceOfCard(a.c), priceOfCard(b.c)];
          if (x === null || y === null) return x === y ? byNewest(a, b) : x === null ? 1 : -1; // on-request pieces sort last either way
          return (q.sort === "price-asc" ? x - y : y - x) || byNewest(a, b);
        }
        if (q.sort === "bestselling") return (w.sold.get(id(b.p._id)) ?? 0) - (w.sold.get(id(a.p._id)) ?? 0) || byNewest(a, b);
        return byNewest(a, b);
      });

      // Facets from the browsing scope.
      const scopedCards = scoped.map((p) => card(w, p));
      const prices = scopedCards.map((c) => priceOfCard(c)).filter((n): n is number => n !== null);
      const catCounts = new Map<string, number>();
      for (const p of scoped) if (p.categoryId) catCounts.set(id(p.categoryId), (catCounts.get(id(p.categoryId)) ?? 0) + 1);
      const facets: StoreFacets = {
        metals: [...new Map(scopedCards.filter((c) => c.metal).map((c) => [c.metal!.code, c.metal!])).values()].sort((a, b) => a.name.localeCompare(b.name)),
        purities: [...new Set(scopedCards.map((c) => c.purity).filter((x): x is string => Boolean(x)))].sort(),
        categories: [...catCounts.entries()].map(([cid, count]) => { const c = w.categories.get(cid)!; return { name: c.name, slug: c.slug, count, ...(c.parentId && w.categories.get(id(c.parentId)) ? { parentSlug: w.categories.get(id(c.parentId))!.slug } : {}) }; }).sort((a, b) => a.name.localeCompare(b.name)),
        price: prices.length ? { min: Math.min(...prices), max: Math.max(...prices) } : null,
      };
      const start = (q.page - 1) * q.pageSize;
      return { items: cards.slice(start, start + q.pageSize).map((x) => x.c), total: cards.length, page: q.page, pageSize: q.pageSize, facets };
    },

    async detail(slug: string): Promise<StoreProductDetail> {
      const w = await world();
      const p = (await ProductModel.findOne({ slug, ...LIVE }).lean()) as unknown as ProductLean | null;
      if (!p) throw new NotFoundError("Product", slug);
      const variants = await ProductVariantModel.find({ productId: p._id, isActive: true }).sort({ sku: 1 }).lean();
      const base = card(w, p);
      const trail: { name: string; slug: string }[] = [];
      for (let c = p.categoryId ? w.categories.get(id(p.categoryId)) : undefined; c; c = c.parentId ? w.categories.get(id(c.parentId)) : undefined) trail.unshift({ name: c.name, slug: c.slug });
      const gross = p.defaultGrossWeight;
      const net = p.defaultNetWeight ?? gross;
      return {
        ...base,
        sku: p.sku,
        ...(p.description ? { description: p.description } : {}),
        images: p.images.map((_, i) => image(p, i)!),
        collections: p.collectionIds.map((cid) => w.collections.get(id(cid))).filter((c) => c).map((c) => ({ name: c!.name, slug: c!.slug })),
        categoryTrail: trail,
        variants: variants.map((v) => ({
          sku: v.sku,
          attributes: attrsOf(v),
          price: priceOf(w, p, { gross: v.defaultGrossWeight ?? undefined, net: v.defaultNetWeight ?? undefined }),
          availability: availability(w.byVariant.get(`${id(p._id)}:${id(v._id)}`)),
        })),
        specs: {
          ...(gross !== undefined ? { grossWeight: gross } : {}),
          ...(net !== undefined ? { netWeight: net } : {}),
          ...(gross !== undefined && net !== undefined && gross - net > 0 ? { stoneWeight: Math.round((gross - net) * 1000) / 1000 } : {}),
          stones: p.stoneDetails.map((s) => ({ name: s.name, caratWeight: s.caratWeight, quantity: s.quantity, ...(s.quality ? { quality: s.quality } : {}) })),
        },
        tags: p.tags,
        updatedAt: p.updatedAt.toISOString(),
      };
    },

    /** Prices a bag: what each line costs today, how many can really be bought, and the total — re-checked on every call, never trusted from the browser. */
    async quote(input: StoreCartQuoteInput): Promise<StoreCartQuote> {
      const w = await world();
      const products = (await ProductModel.find({ slug: { $in: input.lines.map((l) => l.slug) }, ...LIVE }).lean()) as unknown as ProductLean[];
      const bySlug = new Map(products.map((p) => [p.slug, p]));
      const variants = await ProductVariantModel.find({ productId: { $in: products.map((p) => p._id) }, isActive: true }).lean();
      const lines: StoreCartLine[] = [];
      for (const line of input.lines) {
        const p = bySlug.get(line.slug);
        if (!p) { lines.push({ slug: line.slug, name: "No longer available", quantity: line.quantity, maxQuantity: 0, unitPrice: { status: "ON_REQUEST", reason: "PRICING_NOT_CONFIGURED", message: "This piece is no longer available." }, lineTotal: null, availability: { status: "OUT_OF_STOCK", hallmarked: false }, notes: ["This piece is no longer available."], ...(line.variantSku ? { variantSku: line.variantSku } : {}) }); continue; }
        const v = line.variantSku ? variants.find((x) => id(x.productId) === id(p._id) && x.sku === line.variantSku) : undefined;
        const notes: string[] = [];
        if (line.variantSku && !v) notes.push("That size is no longer offered.");
        const unit = priceOf(w, p, v ? { gross: v.defaultGrossWeight ?? undefined, net: v.defaultNetWeight ?? undefined } : undefined);
        const needsSize = !v && w.hasSizes(id(p._id));
        if (needsSize && !line.variantSku) notes.push("Please choose a size.");
        const stock = v ? w.byVariant.get(`${id(p._id)}:${id(v._id)}`) : needsSize ? undefined : w.byProduct.get(id(p._id));
        const avail = availability(stock);
        const max = Math.min(stock?.count ?? 0, 10);
        let quantity = line.quantity;
        if (max > 0 && quantity > max) { quantity = max; notes.push(`Only ${max} available — quantity reduced.`); }
        if (max === 0) notes.push("Currently unavailable.");
        if (unit.status === "ON_REQUEST") notes.push(unit.message);
        const attrs = v ? Object.values(attrsOf(v)).join(" · ") : "";
        lines.push({
          slug: p.slug, ...(v ? { variantSku: v.sku } : {}), name: p.name, image: image(p, 0), ...(attrs ? { variantLabel: attrs } : {}),
          quantity, maxQuantity: max, unitPrice: unit, lineTotal: unit.status === "AVAILABLE" && max > 0 ? unit.total * quantity : null, availability: avail, notes,
        });
      }
      let taxable = 0, gst = 0, total = 0, complete = true;
      for (const l of lines) {
        if (l.unitPrice.status === "AVAILABLE" && l.maxQuantity > 0) { taxable += l.unitPrice.breakdown.taxableValue * l.quantity; gst += l.unitPrice.breakdown.gst * l.quantity; total += l.unitPrice.total * l.quantity; } else complete = false;
      }
      return { lines, totals: { taxableValue: taxable, gst, total, complete }, quotedAt: w.now.toISOString() };
    },

    async home(): Promise<StoreHome> {
      const w = await world();
      const nav = await this.navigation();
      const list = (items: ProductLean[]) => items.map((p) => card(w, p));
      const c = w.content;
      const bySlugs = async (slugs: string[]) => {
        const found = (await ProductModel.find({ slug: { $in: slugs }, ...LIVE }).lean()) as unknown as ProductLean[];
        return slugs.map((s) => found.find((p) => p.slug === s)).filter((p): p is ProductLean => Boolean(p));
      };
      const [featured, newest, soldIds] = await Promise.all([
        bySlugs(c.featured.productSlugs),
        // A design with no photograph is not shown on the home page: it would be a blank tile in the shop window.
        ProductModel.find({ ...LIVE, "images.0": { $exists: true } }).sort({ createdAt: -1 }).limit(8).lean() as unknown as Promise<ProductLean[]>,
        Promise.resolve([...w.sold.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([pid]) => pid)),
      ]);
      const best = soldIds.length ? ((await ProductModel.find({ _id: { $in: soldIds }, ...LIVE }).lean()) as unknown as ProductLean[]).sort((a, b) => (w.sold.get(id(b._id)) ?? 0) - (w.sold.get(id(a._id)) ?? 0)) : [];
      const curated = c.featured.collectionSlugs.map((s) => nav.collections.find((x) => x.slug === s)).filter((x): x is StoreCollectionNode => Boolean(x));
      return { content: c, collections: curated, categories: nav.categories.filter((x) => !x.parentSlug).slice(0, 8), featured: list(featured), newArrivals: list(newest), bestsellers: list(best) };
    },

    /** Everything a search engine should know about. */
    async sitemap() {
      const [products, categories, collections] = await Promise.all([
        ProductModel.find(LIVE).select("slug updatedAt").lean(),
        ProductCategoryModel.find({ isActive: true }).select("slug updatedAt").lean(),
        ProductCollectionModel.find({ isActive: true }).select("slug updatedAt").lean(),
      ]);
      const out = (rows: { slug: string; updatedAt?: Date }[]) => rows.map((r) => ({ slug: r.slug, updatedAt: (r.updatedAt ?? new Date(0)).toISOString() }));
      return { products: out(products), categories: out(categories), collections: out(collections) };
    },

    /** Records the address once. The answer is the same whether or not it was already there, so the form can't be used to discover who is subscribed. */
    async subscribe(email: string): Promise<void> {
      await NewsletterSubscriptionModel.updateOne({ email }, { $setOnInsert: { email, source: "storefront", consentedAt: clock() } }, { upsert: true });
    },
  };
}
export type StorefrontService = ReturnType<typeof createStorefrontService>;
