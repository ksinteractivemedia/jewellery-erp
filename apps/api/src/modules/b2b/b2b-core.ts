import { Types, type ClientSession } from "mongoose";
import type { B2BCatalogueItem, B2BLine, B2BPrice, B2BResolvedLine, B2BTotals, CreditPosition, PriceBasis } from "@jewellery/types";
import { AuthorizationError, NotFoundError } from "../../shared/errors";
import { ProductCategoryModel } from "../catalog/product-category.model";
import { ProductVariantModel } from "../catalog/product-variant.model";
import { ProductModel } from "../catalog/product.model";
import { CustomerModel, type CustomerAttrs } from "../customers/customer.model";
import { businessDay } from "../dashboard/range";
import { InventoryItemModel } from "../inventory/inventory-item.model";
import type { MediaService } from "../media/media.service";
import { findCurrentPriceList } from "../pricing/price-list.repository";
import { loadStoreSettings } from "../orders/store-settings";
import { loadPricingWorld, priceDesignWithEvidence, type PricedDesign, type PricingAudience, type PricingWorld } from "../storefront/storefront-pricing";
import { AllocationModel, InvoiceModel, SalesOrderModel } from "./b2b.models";
import { creditPosition } from "./credit";

const id = (v: unknown) => String(v);

// ---- the customer, and how they are priced -----------------------------------------------------------
export interface CustomerContext {
  now: Date;
  today: string;
  customer: { id: string; name: string; gstin?: string; groupId?: string; email?: string; phone?: string; billingAddress?: Address; shippingAddresses: Address[] };
  profile: NonNullable<CustomerAttrs["b2b"]>;
  priceList?: { id: string; code: string; name: string };
  audience: PricingAudience;
  world: PricingWorld;
}
type Address = { line1: string; line2?: string; city: string; state: string; postalCode: string; country: string };

/** Everything a B2B price depends on for one customer, loaded once per request. A customer that is not an active wholesale account is refused here, for every caller. */
export async function customerContext(customerId: string, now: Date): Promise<CustomerContext> {
  const c = await CustomerModel.findById(customerId).lean();
  if (!c) throw new NotFoundError("Customer", customerId);
  if (c.type !== "B2B" || !c.b2b) throw new AuthorizationError("This is not a wholesale account");
  if (!c.isActive) throw new AuthorizationError("This account is not active");
  const settings = await loadStoreSettings();
  const [world, priceList] = await Promise.all([loadPricingWorld(now, settings.hsnCode), c.b2b.priceListCode ? findCurrentPriceList(c.b2b.priceListCode, now) : null]);
  const groupId = c.customerGroupId ? id(c.customerGroupId) : undefined;
  return {
    now,
    today: businessDay(now),
    customer: { id: id(c._id), name: c.name, ...(c.gstin ? { gstin: c.gstin } : {}), ...(groupId ? { groupId } : {}), ...(c.email ? { email: c.email } : {}), ...(c.phone ? { phone: c.phone } : {}), ...(c.billingAddress ? { billingAddress: c.billingAddress as Address } : {}), shippingAddresses: (c.shippingAddresses ?? []) as Address[] },
    profile: c.b2b as CustomerContext["profile"],
    ...(priceList ? { priceList: { id: priceList.id, code: priceList.code, name: priceList.name } } : {}),
    audience: { channel: "B2B", customerType: "B2B", customerId: id(c._id), ...(groupId ? { customerGroupId: groupId } : {}), ...(priceList ? { priceListId: priceList.id } : {}) },
    world,
  };
}

/** The GST place of supply is where the goods go: the chosen shipping address, else billing, else the seller's own state (no tax split assumed). */
export const buyerStateFor = (ctx: CustomerContext, address?: Address) => address?.state ?? ctx.customer.shippingAddresses[0]?.state ?? ctx.customer.billingAddress?.state ?? ctx.world.sellerState ?? undefined;

// ---- SKUs, stock, prices ------------------------------------------------------------------------------
type ProductLean = {
  _id: Types.ObjectId; sku: string; name: string; categoryId?: Types.ObjectId; metalId: Types.ObjectId; purity?: string; defaultGrossWeight?: number; defaultNetWeight?: number;
  stoneDetails: unknown[]; stoneValue?: number; images: { key: string }[]; isActive: boolean; b2bEnabled: boolean; b2bMinOrderQuantity?: number; b2bPriceOnRequest?: boolean;
};
type VariantLean = { _id: Types.ObjectId; productId: Types.ObjectId; sku: string; attributes?: unknown; defaultGrossWeight?: number; defaultNetWeight?: number; isActive: boolean };
export const variantLabel = (v: { attributes?: unknown }) => Object.values(v.attributes instanceof Map ? Object.fromEntries(v.attributes) : ((v.attributes ?? {}) as Record<string, string>)).join(" · ");

export interface SkuHit { product: ProductLean; variant?: VariantLean; sku: string; soldBySize: boolean }

/** Product and variant SKUs → what they are. A design sold by size is ordered by size SKU, so its own SKU resolves with `soldBySize`. */
export async function lookupSkus(skus: string[]): Promise<Map<string, SkuHit>> {
  const wanted = [...new Set(skus.map((s) => s.trim().toUpperCase()))];
  const [variants, products] = await Promise.all([
    ProductVariantModel.find({ sku: { $in: wanted }, isActive: true }).lean() as unknown as Promise<VariantLean[]>,
    ProductModel.find({ sku: { $in: wanted } }).lean() as unknown as Promise<ProductLean[]>,
  ]);
  const owners = (await ProductModel.find({ _id: { $in: variants.map((v) => v.productId) } }).lean()) as unknown as ProductLean[];
  const ownerById = new Map(owners.map((p) => [id(p._id), p]));
  const sized = new Set((await ProductVariantModel.find({ productId: { $in: products.map((p) => p._id) }, isActive: true }).select("productId").lean()).map((v) => id(v.productId)));
  const out = new Map<string, SkuHit>();
  for (const p of products) out.set(p.sku, { product: p, sku: p.sku, soldBySize: sized.has(id(p._id)) });
  for (const v of variants) {
    const product = ownerById.get(id(v.productId));
    if (product) out.set(v.sku, { product, variant: v, sku: v.sku, soldBySize: false });
  }
  return out;
}

/** Pieces available right now: finished jewellery, AVAILABLE, unreserved — one count per (design, size). */
export async function stockCounts(productIds: Types.ObjectId[]): Promise<Map<string, number>> {
  const rows = await InventoryItemModel.aggregate<{ _id: { p: unknown; v: unknown }; n: number }>([
    { $match: { productId: { $in: productIds }, status: "AVAILABLE", type: "FINISHED_JEWELLERY", reservation: { $exists: false }, quantity: { $gt: 0 } } },
    { $group: { _id: { p: "$productId", v: { $ifNull: ["$variantId", null] } }, n: { $sum: 1 } } },
  ]);
  return new Map(rows.map((r) => [`${id(r._id.p)}:${r._id.v ? id(r._id.v) : ""}`, r.n]));
}
export const stockKey = (h: { product: { _id: unknown }; variant?: { _id: unknown } }) => `${id(h.product._id)}:${h.variant ? id(h.variant._id) : ""}`;

const REASONS: Record<string, string> = {
  NO_WEIGHT: "Priced individually — request a quotation.",
  STONE_VALUE_MISSING: "Stones are valued individually — request a quotation.",
  NO_METAL_RATE: "The metal rate is being updated — request a quotation.",
  PRICING_NOT_CONFIGURED: "Price unavailable — request a quotation.",
};
const BASIS: Record<string, PriceBasis> = { CUSTOMER: "CUSTOMER", CUSTOMER_GROUP: "CUSTOMER_GROUP", PRICE_LIST: "PRICE_LIST", CATEGORY: "CATEGORY", DEFAULT: "DEFAULT" };

/** The wholesale price of a design (or size) for this customer — by the ONE pricing engine, so customer, group and price-list rules apply in the engine's own order. */
export function priceFor(ctx: CustomerContext, hit: SkuHit, state: string | undefined, discountOverride?: PricingAudience["discountOverride"], opts: { ignorePolicy?: boolean } = {}): { price: B2BPrice; priced?: PricedDesign } {
  const { product, variant } = hit;
  if (product.b2bPriceOnRequest && !opts.ignorePolicy) return { price: { status: "ON_REQUEST", reason: "POLICY", message: "This piece is quoted individually — request a quotation." } };
  const priced = priceDesignWithEvidence(
    ctx.world,
    {
      metalId: id(product.metalId),
      purity: product.purity,
      grossWeight: variant?.defaultGrossWeight ?? product.defaultGrossWeight,
      netWeight: variant?.defaultNetWeight ?? variant?.defaultGrossWeight ?? product.defaultNetWeight,
      hasStones: product.stoneDetails.length > 0,
      stoneValue: product.stoneValue,
      ...(product.categoryId ? { categoryId: id(product.categoryId) } : {}),
    },
    state,
    { ...ctx.audience, ...(discountOverride ? { discountOverride } : {}) }
  );
  if (priced.price.status === "ON_REQUEST" || !priced.evidence) return { price: { status: "ON_REQUEST", reason: priced.price.status === "ON_REQUEST" ? priced.price.reason : "PRICING_NOT_CONFIGURED", message: REASONS[priced.price.status === "ON_REQUEST" ? priced.price.reason : "PRICING_NOT_CONFIGURED"]! } };
  const b = priced.evidence.breakdown;
  const making = b.rules.making?.source;
  const tier = making && making.kind === "RULE" ? making.tier : undefined;
  return {
    priced,
    price: {
      status: "AVAILABLE",
      unitMaking: b.makingCharges,
      unitDiscount: b.discount,
      unitTaxable: b.taxableValue,
      unitGst: b.totalTax,
      unitTotal: b.finalAmount,
      basis: (tier && BASIS[tier]) || "DEFAULT",
      ...(making && making.kind === "RULE" ? { basisName: making.ruleName } : {}),
      ratePerGram: b.rate.ratePerGram,
      computedAt: priced.evidence.computedAt,
    },
  };
}

export interface Resolved {
  hit?: SkuHit;
  sku: string;
  quantity: number;
  available: number;
  moq: number;
  price?: B2BPrice;
  priced?: PricedDesign;
  problems: B2BResolvedLine["problems"];
}

/**
 * SKU + quantity rows → what each would be, and what stops it: an unknown or unoffered SKU, a quantity under the minimum, stock,
 * a price on request. Blocking problems stop an order; the rest inform. Nothing here trusts the browser for anything but the SKU and the count.
 */
export async function resolveRows(ctx: CustomerContext, rows: { sku: string; quantity: number }[], state?: string, opts: { ignorePolicy?: boolean } = {}): Promise<Resolved[]> {
  const merged = new Map<string, number>();
  for (const r of rows) merged.set(r.sku.trim().toUpperCase(), (merged.get(r.sku.trim().toUpperCase()) ?? 0) + r.quantity);
  const hits = await lookupSkus([...merged.keys()]);
  const stock = await stockCounts([...hits.values()].map((h) => h.product._id));
  const out: Resolved[] = [];
  for (const [sku, quantity] of merged) {
    const hit = hits.get(sku);
    const base = { sku, quantity, available: 0, moq: 1, problems: [] as Resolved["problems"] };
    if (!hit) { out.push({ ...base, problems: [{ code: "UNKNOWN_SKU", message: `We don't have a SKU "${sku}".`, blocking: true }] }); continue; }
    const moq = hit.product.b2bMinOrderQuantity ?? 1;
    const problems = base.problems;
    if (!hit.product.isActive || !hit.product.b2bEnabled) problems.push({ code: "NOT_OFFERED", message: `${sku} isn't offered to wholesale customers.`, blocking: true });
    else if (hit.soldBySize) problems.push({ code: "NOT_OFFERED", message: `${sku} is sold by size — order a size SKU.`, blocking: true });
    if (quantity < moq) problems.push({ code: "BELOW_MOQ", message: `The minimum order for ${sku} is ${moq}.`, blocking: true });
    const available = stock.get(stockKey(hit)) ?? 0;
    if (available === 0) problems.push({ code: "OUT_OF_STOCK", message: `${sku} is out of stock right now.`, blocking: false });
    else if (available < quantity) problems.push({ code: "INSUFFICIENT_STOCK", message: `Only ${available} of ${sku} in stock (you asked for ${quantity}).`, blocking: false });
    const { price, priced } = priceFor(ctx, hit, state, undefined, opts);
    if (price.status === "ON_REQUEST") problems.push({ code: "PRICE_ON_REQUEST", message: `${sku}: ${price.message}`, blocking: false });
    out.push({ hit, sku, quantity, available, moq, price, ...(priced ? { priced } : {}), problems });
  }
  return out;
}

export function catalogueItem(hit: SkuHit, price: B2BPrice, available: number, names: { category?: string; metal?: string }, media: MediaService): B2BCatalogueItem {
  const { product, variant } = hit;
  const net = variant?.defaultNetWeight ?? product.defaultNetWeight;
  const gross = variant?.defaultGrossWeight ?? product.defaultGrossWeight;
  return {
    productId: id(product._id),
    ...(variant ? { variantId: id(variant._id) } : {}),
    sku: hit.sku,
    name: product.name,
    ...(variant && variantLabel(variant) ? { variantLabel: variantLabel(variant) } : {}),
    ...(names.category ? { category: names.category } : {}),
    ...(names.metal ? { metal: names.metal } : {}),
    ...(product.purity ? { purity: product.purity } : {}),
    ...(gross !== undefined ? { grossWeight: gross } : {}),
    ...(net !== undefined ? { netWeight: net } : {}),
    hasStones: product.stoneDetails.length > 0,
    ...(product.images[0] ? { image: media.urlFor(product.images[0].key) } : {}),
    price,
    available,
    minOrderQuantity: product.b2bMinOrderQuantity ?? 1,
  };
}

export const resolvedView = (r: Resolved, item?: B2BCatalogueItem): B2BResolvedLine => {
  const priced = r.price?.status === "AVAILABLE" ? r.price : undefined;
  return {
    sku: r.sku,
    quantity: r.quantity,
    ...(item ? { item } : {}),
    lineTaxable: priced ? priced.unitTaxable * r.quantity : null,
    lineGst: priced ? priced.unitGst * r.quantity : null,
    lineTotal: priced ? priced.unitTotal * r.quantity : null,
    problems: r.problems,
  };
};

// ---- document lines ---------------------------------------------------------------------------------
/** A priced (or price-on-request) line, in the shape every B2B document stores. */
export function lineOf(r: Resolved, concession?: B2BLine["concession"]): B2BLine {
  const p = r.price?.status === "AVAILABLE" ? r.price : undefined;
  const hit = r.hit!;
  return {
    productId: id(hit.product._id),
    ...(hit.variant ? { variantId: id(hit.variant._id) } : {}),
    sku: r.sku,
    name: hit.product.name,
    ...(hit.variant && variantLabel(hit.variant) ? { variantLabel: variantLabel(hit.variant) } : {}),
    quantity: r.quantity,
    ...(p ? {} : { priceOnRequest: true }),
    unitMaking: p?.unitMaking ?? 0,
    unitDiscount: p?.unitDiscount ?? 0,
    unitTaxable: p?.unitTaxable ?? 0,
    unitGst: p?.unitGst ?? 0,
    unitTotal: p?.unitTotal ?? 0,
    lineMaking: (p?.unitMaking ?? 0) * r.quantity,
    lineDiscount: (p?.unitDiscount ?? 0) * r.quantity,
    lineTaxable: (p?.unitTaxable ?? 0) * r.quantity,
    lineGst: (p?.unitGst ?? 0) * r.quantity,
    lineTotal: (p?.unitTotal ?? 0) * r.quantity,
    ...(p ? { basis: p.basis } : {}),
    ...(concession ? { concession } : {}),
  };
}
export const totalsOf = (lines: Pick<B2BLine, "lineTaxable" | "lineGst" | "lineTotal" | "priceOnRequest">[]): B2BTotals => ({
  taxable: lines.reduce((s, l) => s + l.lineTaxable, 0),
  gst: lines.reduce((s, l) => s + l.lineGst, 0),
  total: lines.reduce((s, l) => s + l.lineTotal, 0),
  complete: lines.every((l) => !l.priceOnRequest),
});

// ---- credit, from the documents ------------------------------------------------------------------------
/** Money paid against each invoice: every allocation not reversed. Allocations only ever exist against VERIFIED payments. */
export async function paidByInvoice(invoiceIds: (Types.ObjectId | string)[], session?: ClientSession): Promise<Map<string, number>> {
  if (!invoiceIds.length) return new Map();
  const rows = await AllocationModel.aggregate<{ _id: unknown; paid: number }>([{ $match: { invoiceId: { $in: invoiceIds.map((x) => (typeof x === "string" ? new Types.ObjectId(x) : x)) }, reversedAt: { $exists: false } } }, { $group: { _id: "$invoiceId", paid: { $sum: "$amount" } } }]).session(session ?? null);
  return new Map(rows.map((r) => [id(r._id), r.paid]));
}

/** Where a customer stands against their limit right now — from invoices, allocations and approved orders, never from a stored figure. */
export async function creditFor(customerId: string | Types.ObjectId, ctx: Pick<CustomerContext, "profile" | "today">, session?: ClientSession): Promise<CreditPosition> {
  const invoices = await InvoiceModel.find({ customerId, status: "ISSUED" }).session(session ?? null).lean();
  const paid = await paidByInvoice(invoices.map((i) => i._id), session);
  // Promised, not yet invoiced: for every live order, what is left to invoice (an invoiced part is already in `invoices`).
  const live = await SalesOrderModel.find({ customerId, status: { $in: ["CONFIRMED", "PARTIALLY_ALLOCATED", "ALLOCATED", "PARTIALLY_FULFILLED"] } }).select("lines invoiced").session(session ?? null).lean();
  const committed = live.map((o) => o.lines.reduce((sum, l, i) => sum + (l.quantity - (o.invoiced.find((x) => x.lineIndex === i)?.quantity ?? 0)) * l.unitTotal, 0));
  return creditPosition({
    limit: ctx.profile.creditLimit,
    onHold: ctx.profile.creditHold,
    blockOnOverdue: ctx.profile.blockOnOverdue,
    invoices: invoices.map((i) => ({ balance: i.totals.total - (paid.get(id(i._id)) ?? 0), dueDate: i.dueDate })).filter((i) => i.balance > 0),
    committedOrders: committed,
    today: ctx.today,
  });
}
