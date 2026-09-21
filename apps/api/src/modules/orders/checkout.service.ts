import { createHash } from "node:crypto";
import { Types } from "mongoose";
import type { CheckoutIssue, StoreCheckoutLine, StoreCheckoutVerification, StoreOrder, StorePrice } from "@jewellery/types";
import type { CheckoutVerifyInput, PlaceOrderInput } from "@jewellery/validation";
import type { AppConfig } from "../../config/app-config";
import { formatDocumentNumber, nextSequence } from "../../shared/counters";
import { ProductVariantModel } from "../catalog/product-variant.model";
import { ProductModel } from "../catalog/product.model";
import { InventoryItemModel } from "../inventory/inventory-item.model";
import { withInventoryTransaction } from "../inventory/inventory-transaction.service";
import type { MediaService } from "../media/media.service";
import { loadPricingWorld, priceDesignWithEvidence, type PricedDesign } from "../storefront/storefront-pricing";
import { CheckoutBlockedError, IdempotencyKeyReusedError, PriceChangedError, StockChangedError } from "./checkout.errors";
import { orderAccessToken } from "./order-access";
import { holdPieces, isStockConflict, pickPieces } from "./order-inventory";
import { moveOrder } from "./order-store";
import { toStoreOrder } from "./order-view";
import { OrderModel, type OrderDocument } from "./order.model";
import { PaymentModel } from "./payment.model";
import type { PaymentProviders } from "./payments/payment-provider";
import { PriceSnapshotModel } from "./price-snapshot.model";
import { loadStoreSettings } from "./store-settings";

const id = (v: unknown) => String(v);
const MAX_PICK_ATTEMPTS = 3;

interface ProductLean {
  _id: Types.ObjectId;
  sku: string;
  name: string;
  slug: string;
  categoryId?: Types.ObjectId;
  metalId: Types.ObjectId;
  purity?: string;
  defaultGrossWeight?: number;
  defaultNetWeight?: number;
  stoneDetails: unknown[];
  stoneValue?: number;
  images: { key: string; alt?: string }[];
}
interface VariantLean {
  _id: Types.ObjectId;
  productId: Types.ObjectId;
  sku: string;
  attributes?: unknown;
  defaultGrossWeight?: number;
  defaultNetWeight?: number;
}
const attrsOf = (v: { attributes?: unknown }): string => Object.values(v.attributes instanceof Map ? Object.fromEntries(v.attributes) : ((v.attributes ?? {}) as Record<string, string>)).join(" · ");

/** A line that survived assessment far enough to be priced: the design, the size, what it costs per unit, and the evidence to freeze. */
interface ResolvedLine {
  product: ProductLean;
  variant?: VariantLean;
  quantity: number;
  priced: PricedDesign;
}

/**
 * Checkout: recalculating a bag from nothing but WHICH pieces and HOW MANY, then turning it into an order that holds the
 * stock. The browser is never asked for, and never believed about, a price, a discount, a stock level or a total — it may
 * only say what total it was shown, and that is used solely to notice that the truth has moved.
 */
export function createCheckoutService(deps: { config: AppConfig; media: MediaService; providers: PaymentProviders; now?: () => Date }) {
  const { config, media, providers } = deps;
  const clock = deps.now ?? (() => new Date());

  /** The one place a bag is priced and checked. `verify` reports it; `place` freezes it. */
  async function assess(input: { lines: CheckoutVerifyInput["lines"]; state?: string; deliveryCode?: string }) {
    const now = clock();
    const issues: CheckoutIssue[] = [];
    const settings = await loadStoreSettings();
    const world = await loadPricingWorld(now, settings.hsnCode);

    // The same piece twice in a bag is one line.
    const merged = new Map<string, { slug: string; variantSku?: string; quantity: number }>();
    for (const l of input.lines) {
      const key = `${l.slug}|${l.variantSku ?? ""}`;
      const seen = merged.get(key);
      merged.set(key, seen ? { ...seen, quantity: seen.quantity + l.quantity } : { slug: l.slug, ...(l.variantSku ? { variantSku: l.variantSku } : {}), quantity: l.quantity });
    }

    const products = (await ProductModel.find({ slug: { $in: [...new Set(input.lines.map((l) => l.slug))] }, isActive: true, b2cEnabled: true }).lean()) as unknown as ProductLean[];
    const bySlug = new Map(products.map((p) => [p.slug, p]));
    const variants = (await ProductVariantModel.find({ productId: { $in: products.map((p) => p._id) }, isActive: true }).lean()) as unknown as VariantLean[];
    const stock = await InventoryItemModel.aggregate<{ _id: { productId: unknown; variantId: unknown }; count: number }>([
      { $match: { productId: { $in: products.map((p) => p._id) }, status: "AVAILABLE", type: "FINISHED_JEWELLERY", reservation: { $exists: false }, quantity: { $gt: 0 } } },
      { $group: { _id: { productId: "$productId", variantId: { $ifNull: ["$variantId", null] } }, count: { $sum: 1 } } },
    ]);
    const available = new Map(stock.map((g) => [`${id(g._id.productId)}:${g._id.variantId ? id(g._id.variantId) : ""}`, g.count]));

    const lines: StoreCheckoutLine[] = [];
    const resolved: ResolvedLine[] = [];
    let supplyType: StoreCheckoutVerification["supplyType"];

    for (const line of merged.values()) {
      const product = bySlug.get(line.slug);
      const base = { slug: line.slug, ...(line.variantSku ? { variantSku: line.variantSku } : {}) };
      if (!product) {
        issues.push({ code: "UNAVAILABLE", message: "This piece is no longer available.", ...base });
        lines.push({ ...base, name: "No longer available", quantity: line.quantity, available: 0, unitPrice: { status: "ON_REQUEST", reason: "PRICING_NOT_CONFIGURED", message: "This piece is no longer available." }, lineTotal: null });
        continue;
      }
      const sizes = variants.filter((v) => id(v.productId) === id(product._id));
      const variant = line.variantSku ? sizes.find((v) => v.sku === line.variantSku) : undefined;
      const problems: CheckoutIssue[] = [];
      if (line.variantSku && !variant) problems.push({ code: "INVALID_SIZE", message: `${product.name}: that size is no longer offered.`, ...base });
      if (!line.variantSku && sizes.length) problems.push({ code: "SIZE_REQUIRED", message: `${product.name}: please choose a size.`, ...base });

      const priced = priceDesignWithEvidence(
        world,
        {
          metalId: id(product.metalId),
          purity: product.purity,
          grossWeight: variant?.defaultGrossWeight ?? product.defaultGrossWeight,
          netWeight: variant?.defaultNetWeight ?? variant?.defaultGrossWeight ?? product.defaultNetWeight,
          hasStones: product.stoneDetails.length > 0,
          stoneValue: product.stoneValue,
          ...(product.categoryId ? { categoryId: id(product.categoryId) } : {}),
        },
        input.state
      );
      if (priced.price.status === "ON_REQUEST") problems.push({ code: "PRICE_ON_REQUEST", message: `${product.name}: ${priced.price.message}`, ...base });

      const stockKey = `${id(product._id)}:${variant ? id(variant._id) : ""}`;
      const have = problems.some((p) => p.code === "SIZE_REQUIRED" || p.code === "INVALID_SIZE") ? 0 : (available.get(stockKey) ?? 0);
      if (!problems.some((p) => p.code === "SIZE_REQUIRED" || p.code === "INVALID_SIZE")) {
        if (have === 0) problems.push({ code: "UNAVAILABLE", message: `${product.name} is out of stock.`, ...base });
        else if (have < line.quantity) problems.push({ code: "INSUFFICIENT_STOCK", message: `Only ${have} of ${product.name} ${have === 1 ? "is" : "are"} available.`, ...base });
      }
      issues.push(...problems);

      const unit: StorePrice = priced.price;
      lines.push({
        ...base,
        name: product.name,
        ...(product.images[0] ? { image: { url: media.urlFor(product.images[0].key), alt: product.images[0].alt ?? product.name } } : {}),
        ...(variant && attrsOf(variant) ? { variantLabel: attrsOf(variant) } : {}),
        quantity: line.quantity,
        available: have,
        unitPrice: unit,
        lineTotal: unit.status === "AVAILABLE" ? unit.total * line.quantity : null,
      });
      if (priced.evidence && !problems.length) {
        resolved.push({ product, ...(variant ? { variant } : {}), quantity: line.quantity, priced });
        supplyType = priced.evidence.breakdown.taxes.supplyType;
      }
    }

    // ---- delivery ------------------------------------------------------------------------------
    const deliveryOptions = settings.deliveryOptions;
    const delivery = input.deliveryCode ? deliveryOptions.find((o) => o.code === input.deliveryCode) : undefined;
    if (!deliveryOptions.length) issues.push({ code: "NO_DELIVERY_OPTIONS", message: "Delivery isn't set up yet, so this order can't be placed online." });
    else if (!input.deliveryCode) issues.push({ code: "DELIVERY_NOT_CHOSEN", message: "Choose how you'd like it delivered." });
    else if (!delivery) issues.push({ code: "DELIVERY_NOT_OFFERED", message: "That delivery option isn't offered." });

    // Holding someone's pieces with no way for them to pay would only lock stock up.
    if (!providers.isConfigured) issues.push({ code: "PAYMENTS_NOT_AVAILABLE", message: "Online payment isn't available right now, so an order can't be placed." });

    // ---- totals — every figure summed from server-priced lines --------------------------------
    let taxableValue = 0;
    let gst = 0;
    let goods = 0;
    for (const l of lines) {
      if (l.unitPrice.status !== "AVAILABLE") continue;
      taxableValue += l.unitPrice.breakdown.taxableValue * l.quantity;
      gst += l.unitPrice.breakdown.gst * l.quantity;
      goods += l.unitPrice.total * l.quantity;
    }
    const deliveryFee = delivery?.fee ?? 0;
    const verification: StoreCheckoutVerification = {
      lines,
      deliveryOptions,
      ...(delivery ? { delivery } : {}),
      totals: { taxableValue, gst, deliveryFee, total: goods + deliveryFee },
      issues,
      canPlaceOrder: issues.length === 0 && lines.length > 0,
      ...(supplyType ? { supplyType } : {}),
      verifiedAt: now.toISOString(),
    };
    return { verification, resolved, now };
  }

  const order = async (doc: OrderDocument): Promise<StoreOrder> => {
    const payment = await PaymentModel.findOne({ orderId: doc._id }).sort({ attempt: -1 });
    return toStoreOrder(doc, payment ? { id: payment.id, status: payment.status, amount: payment.amount, refundedAmount: payment.refundedAmount, failureReason: payment.failureReason } : null, media, clock());
  };
  const token = (orderId: string) => orderAccessToken(config.auth.accessSecret, orderId);

  return {
    /** What this bag costs and whether it can be bought — recalculated now, from the catalogue, the metal rate and the stock. */
    async verify(input: CheckoutVerifyInput): Promise<StoreCheckoutVerification> {
      return (await assess(input)).verification;
    },

    /**
     * Turn a verified bag into an order: DRAFT (with frozen price snapshots) → hold the pieces → PENDING_PAYMENT. Refuses, creating
     * nothing, if the total the customer agreed to is not the total the backend now calculates.
     */
    async place(input: PlaceOrderInput, actor: { userId?: string } = {}): Promise<{ order: StoreOrder; accessToken: string; replayed: boolean }> {
      const requestHash = createHash("sha256")
        .update(JSON.stringify({ lines: [...input.lines].sort((a, b) => `${a.slug}${a.variantSku}`.localeCompare(`${b.slug}${b.variantSku}`)), contact: input.contact, deliveryCode: input.deliveryCode }))
        .digest("hex");

      // A retry of the same attempt (double-click, lost response) is answered with the order it already made.
      const existing = await OrderModel.findOne({ idempotencyKey: input.idempotencyKey });
      if (existing) {
        if (existing.requestHash !== requestHash) throw new IdempotencyKeyReusedError();
        return { order: await order(existing), accessToken: token(existing.id), replayed: true };
      }

      const { verification, resolved, now } = await assess({ lines: input.lines, state: input.contact.state, deliveryCode: input.deliveryCode });
      if (!verification.canPlaceOrder) {
        const stock = verification.issues.some((i) => i.code === "UNAVAILABLE" || i.code === "INSUFFICIENT_STOCK");
        throw stock ? new StockChangedError(verification) : new CheckoutBlockedError(verification);
      }
      if (verification.totals.total !== input.agreedTotal) throw new PriceChangedError(verification, input.agreedTotal);

      // ---- the draft: order + one frozen price per line, together or not at all ----------------
      const orderId = new Types.ObjectId();
      const orderNo = formatDocumentNumber("ORD", await nextSequence("order"));
      const holdExpiresAt = new Date(now.getTime() + config.checkout.reservationMinutes * 60_000);
      const lineIds = resolved.map(() => new Types.ObjectId());
      const snapshotIds = resolved.map(() => new Types.ObjectId());
      const delivery = verification.delivery!;

      let draft: OrderDocument;
      try {
        draft = await withInventoryTransaction(async (session) => {
          await PriceSnapshotModel.create(
            resolved.map((r, i) => {
              const evidence = r.priced.evidence!;
              return {
                _id: snapshotIds[i],
                orderId,
                productId: r.product._id,
                ...(r.variant ? { variantId: r.variant._id } : {}),
                sku: r.variant?.sku ?? r.product.sku,
                computedAt: new Date(evidence.computedAt),
                inputs: evidence.inputs,
                breakdown: evidence.breakdown,
                unitTotal: evidence.breakdown.finalAmount,
              };
            }),
            { session, ordered: true }
          );
          const [created] = await OrderModel.create(
            [
              {
                _id: orderId,
                orderNo,
                channel: "B2C",
                status: "DRAFT",
                customer: { ...(actor.userId ? { userId: new Types.ObjectId(actor.userId) } : {}), fullName: input.contact.fullName, email: input.contact.email, phone: input.contact.phone },
                shippingAddress: { line1: input.contact.addressLine1, ...(input.contact.addressLine2 ? { line2: input.contact.addressLine2 } : {}), city: input.contact.city, state: input.contact.state, postalCode: input.contact.postalCode },
                delivery: { code: delivery.code, label: delivery.label, fee: delivery.fee, ...(delivery.estimate ? { estimate: delivery.estimate } : {}) },
                items: resolved.map((r, i) => {
                  const b = r.priced.evidence!.breakdown;
                  return {
                    _id: lineIds[i],
                    productId: r.product._id,
                    ...(r.variant ? { variantId: r.variant._id } : {}),
                    slug: r.product.slug,
                    ...(r.variant ? { variantSku: r.variant.sku } : {}),
                    sku: r.variant?.sku ?? r.product.sku,
                    name: r.product.name,
                    ...(r.variant && attrsOf(r.variant) ? { variantLabel: attrsOf(r.variant) } : {}),
                    ...(r.product.images[0] ? { imageKey: r.product.images[0].key, imageAlt: r.product.images[0].alt } : {}),
                    quantity: r.quantity,
                    priceSnapshotId: snapshotIds[i],
                    unitPrice: b.finalAmount,
                    lineTotal: b.finalAmount * r.quantity,
                    taxableValue: b.taxableValue * r.quantity,
                    gst: b.totalTax * r.quantity,
                  };
                }),
                totals: verification.totals,
                supplyType: verification.supplyType,
                idempotencyKey: input.idempotencyKey,
                requestHash,
                holdExpiresAt,
                placedAt: now,
                statusHistory: [{ to: "DRAFT", at: now }],
              },
            ],
            { session }
          );
          return created!;
        });
      } catch (error) {
        // Two identical submissions raced: the other one won the idempotency key.
        if ((error as { code?: number })?.code === 11000) {
          const winner = await OrderModel.findOne({ idempotencyKey: input.idempotencyKey });
          if (winner && winner.requestHash === requestHash) return { order: await order(winner), accessToken: token(winner.id), replayed: true };
        }
        throw error;
      }

      // ---- hold the pieces, and only then open the order for payment ---------------------------
      const needs = resolved.map((r) => ({ productId: id(r.product._id), ...(r.variant ? { variantId: id(r.variant._id) } : {}), quantity: r.quantity }));
      for (let attempt = 1; attempt <= MAX_PICK_ATTEMPTS; attempt++) {
        const picked = await pickPieces(needs);
        if (!picked) break;
        try {
          const held = await withInventoryTransaction(async (session) => {
            await holdPieces(session, orderId.toHexString(), picked.flat(), holdExpiresAt);
            return moveOrder(orderId, "PENDING_PAYMENT", ["DRAFT"], {
              session,
              at: now,
              set: { allocations: picked.map((itemIds, i) => ({ lineId: lineIds[i], itemIds: itemIds.map((x) => new Types.ObjectId(x)) })) },
            });
          });
          return { order: await order(held!), accessToken: token(orderId.toHexString()), replayed: false };
        } catch (error) {
          if (!isStockConflict(error)) throw error; // a real fault: leave the draft; the expiry sweep will cancel it
          // Someone took a piece between choosing and holding: choose again.
        }
      }
      await moveOrder(orderId, "CANCELLED", ["DRAFT"], { reason: "Stock changed while placing the order", set: { cancelledAt: clock(), cancelReason: "STOCK_CHANGED" }, unset: ["holdExpiresAt"] });
      throw new StockChangedError((await assess({ lines: input.lines, state: input.contact.state, deliveryCode: input.deliveryCode })).verification);
    },
  };
}
export type CheckoutService = ReturnType<typeof createCheckoutService>;
