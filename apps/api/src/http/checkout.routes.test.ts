import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import type { StoreCheckoutVerification, StoreOrder, StorePaymentStart } from "@jewellery/types";
import { buildTestApp } from "../../test/helpers";
import { type World, makeWorld, receive, someOrder, someUser } from "../../test/inventory-fixtures";
import { createSandboxProvider, type SandboxProvider, type SignedWebhook } from "../../dev-adapters/payment-sandbox";
import { createProductCategory } from "../modules/catalog/product-category.repository";
import { createProduct } from "../modules/catalog/product.repository";
import { ProductModel } from "../modules/catalog/product.model";
import { createTaxRule } from "../modules/compliance/tax-rule.repository";
import { InventoryItemModel } from "../modules/inventory/inventory-item.model";
import { InventoryLedgerModel } from "../modules/inventory/inventory-ledger.model";
import { releaseExpiredReservations, sellItems } from "../modules/inventory/stock-operations";
import { createMetalRate } from "../modules/metals/metal-rate.repository";
import { OrderModel, PaymentEventModel, PaymentModel, PriceSnapshotModel, type OrdersModule } from "../modules/orders";
import { moveOrder } from "../modules/orders/order-store";
import { createPricingRule } from "../modules/pricing/pricing-rule.repository";
import { StorefrontContentModel } from "../modules/storefront/storefront-content.model";

let t: ReturnType<typeof buildTestApp>;
let w: World;
let sandbox: SandboxProvider;
const PAST = new Date("2026-01-01");
const BAND_TOTAL = 7_632_300; // 22K, 10 g at ₹6,500/g, 2% wastage, 12% making, 3% GST — exact fractions, see storefront.routes.test.ts
const EXPRESS = 150_000;
const ords = () => t.app.locals.orders as OrdersModule;

const contact = { fullName: "Asha Rao", email: "asha@example.com", phone: "9876543210", addressLine1: "12 MG Road", city: "Pune", state: "Maharashtra", postalCode: "411001" };
let keyN = 0;
const key = () => `attempt-${String(++keyN).padStart(6, "0")}-abcdef`;
const bag = (slug = "plain-band", quantity = 1) => [{ slug, quantity }];

const api = {
  verify: (body: object) => request(t.app).post("/api/store/checkout/verify").send(body),
  place: (over: Record<string, unknown> = {}) =>
    request(t.app).post("/api/store/checkout/orders").send({ lines: bag(), contact, deliveryCode: "standard", agreedTotal: BAND_TOTAL, idempotencyKey: key(), ...over }),
  order: (o: { orderNo: string }, token: string) => request(t.app).get(`/api/store/orders/${o.orderNo}`).set("X-Order-Token", token),
  pay: (o: { orderNo: string }, token: string) => request(t.app).post(`/api/store/orders/${o.orderNo}/payments`).set("X-Order-Token", token).send({ returnPath: "/checkout/return" }),
  verifyPayment: (o: { orderNo: string }, token: string, paymentId: string, payload = {}) => request(t.app).post(`/api/store/orders/${o.orderNo}/payments/${paymentId}/verify`).set("X-Order-Token", token).send({ payload }),
  cancelPayment: (o: { orderNo: string }, token: string, paymentId: string) => request(t.app).post(`/api/store/orders/${o.orderNo}/payments/${paymentId}/cancel`).set("X-Order-Token", token).send({}),
  cancel: (o: { orderNo: string }, token: string) => request(t.app).post(`/api/store/orders/${o.orderNo}/cancel`).set("X-Order-Token", token).send({ reason: "changed my mind" }),
  webhook: (hook: SignedWebhook, provider = "sandbox") => request(t.app).post(`/api/store/payments/webhooks/${provider}`).set(hook.headers).set("content-type", "application/json").send(hook.body),
};

/** Place an order for the band and return everything a test needs. */
async function placed(over: Record<string, unknown> = {}) {
  const res = await api.place(over);
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  const order = res.body.order as StoreOrder;
  const token = res.body.accessToken as string;
  const doc = (await OrderModel.findOne({ orderNo: order.orderNo }))!;
  return { order, token, doc, itemIds: doc.allocations.flatMap((a) => a.itemIds.map(String)) };
}
async function started(over: Record<string, unknown> = {}) {
  const p = await placed(over);
  const res = await api.pay(p.order, p.token);
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  const payment = res.body.payment as StorePaymentStart;
  return { ...p, payment, ref: `sbx_pay_${payment.paymentId}` };
}
const bandId = async () => (await ProductModel.findOne({ sku: "BAND-1" }))!._id;
const statusOf = async (o: { orderNo: string }) => (await OrderModel.findOne({ orderNo: o.orderNo }))!.status;
const itemStatuses = async (ids: string[]) => (await InventoryItemModel.find({ _id: { $in: ids } })).map((i) => i.status);
const paymentOf = async (id: string) => (await PaymentModel.findById(id))!;

beforeEach(async () => {
  sandbox = createSandboxProvider();
  t = buildTestApp(undefined, { paymentProviders: [sandbox] });
  w = await makeWorld();
  await createMetalRate({ metalId: w.gold, purity: "22K", ratePerGram: 650_000, effectiveFrom: PAST, source: "MANUAL" } as never);
  await createTaxRule({ name: "GST", hsnCode: "7113", intraState: { cgst: 1.5, sgst: 1.5 }, interState: { igst: 3 }, validFrom: PAST });
  await createPricingRule({ name: "Gold retail", metalId: w.gold, customerType: "B2C", makingChargeType: "PERCENTAGE", makingChargeValue: 12, wastageType: "PERCENTAGE", wastageValue: 2, validFrom: PAST } as never);
  await StorefrontContentModel.create({
    key: "default",
    content: {
      brandName: "Suvarna", announcements: [], trust: [], policies: {}, featured: { collectionSlugs: [], productSlugs: [] }, pricing: { hsnCode: "7113" },
      deliveryOptions: [{ code: "standard", label: "Standard", fee: 0 }, { code: "express", label: "Express", fee: EXPRESS, estimate: "2 days" }],
    },
  });
  const rings = await createProductCategory({ name: "Rings" });
  const base = { b2cEnabled: true, isActive: true, images: [{ key: "a1.png", alt: "Front" }], categoryId: rings.id };
  const band = await createProduct({ ...base, sku: "BAND-1", name: "Plain Band", metalId: w.gold, purity: "22K", defaultGrossWeight: 10, defaultNetWeight: 10 } as never);
  const kundan = await createProduct({ ...base, sku: "KUN-1", name: "Kundan Choker", metalId: w.gold, purity: "22K", defaultGrossWeight: 30, defaultNetWeight: 28, stoneDetails: [{ name: "Kundan", caratWeight: 5, quantity: 3 }] } as never);
  await receive(w, { productId: kundan.id, grossWeight: 30, cost: 100_00 }); // in stock, but its stones are unvalued: priced on request
  await receive(w, { productId: band.id, grossWeight: 10, cost: 100_00 });
  await receive(w, { productId: band.id, grossWeight: 10, cost: 100_00 });
});

describe("verification — the backend recalculates everything", () => {
  it("prices the bag itself, from the catalogue, the metal rate and the stock", async () => {
    const res = await api.verify({ lines: bag("plain-band", 2), deliveryCode: "standard" });
    const v = res.body as StoreCheckoutVerification;
    expect(res.status).toBe(200);
    expect(v.canPlaceOrder).toBe(true);
    expect(v.issues).toEqual([]);
    expect(v.lines[0]).toMatchObject({ name: "Plain Band", quantity: 2, available: 2, lineTotal: BAND_TOTAL * 2 });
    expect(v.totals).toEqual({ taxableValue: 7_410_000 * 2, gst: 222_300 * 2, deliveryFee: 0, total: BAND_TOTAL * 2 });
    expect(Date.parse(v.verifiedAt)).not.toBeNaN();
  });

  it("adds the delivery fee the business set — not one the browser names", async () => {
    const v = (await api.verify({ lines: bag(), deliveryCode: "express" })).body as StoreCheckoutVerification;
    expect(v.totals.deliveryFee).toBe(EXPRESS);
    expect(v.totals.total).toBe(BAND_TOTAL + EXPRESS);
  });

  it("splits GST by the delivery state, and the total does not move", async () => {
    const intra = (await api.verify({ lines: bag(), state: "Maharashtra", deliveryCode: "standard" })).body as StoreCheckoutVerification;
    const inter = (await api.verify({ lines: bag(), state: "karnataka", deliveryCode: "standard" })).body as StoreCheckoutVerification;
    expect(intra.supplyType).toBe("INTRA_STATE");
    expect(inter.supplyType).toBe("INTER_STATE");
    expect(inter.totals.total).toBe(intra.totals.total);
  });

  it("reports what stops an order, line by line", async () => {
    const v = (await api.verify({ lines: [{ slug: "plain-band", quantity: 3 }, { slug: "kundan-choker", quantity: 1 }, { slug: "nope", quantity: 1 }], deliveryCode: "standard" })).body as StoreCheckoutVerification;
    expect(v.canPlaceOrder).toBe(false);
    expect(v.issues.map((i) => `${i.slug}:${i.code}`).sort()).toEqual(["kundan-choker:PRICE_ON_REQUEST", "nope:UNAVAILABLE", "plain-band:INSUFFICIENT_STOCK"].sort());
  });

  it("says a delivery option must be chosen, and refuses one that isn't offered", async () => {
    expect(((await api.verify({ lines: bag() })).body as StoreCheckoutVerification).issues.map((i) => i.code)).toContain("DELIVERY_NOT_CHOSEN");
    expect(((await api.verify({ lines: bag(), deliveryCode: "drone" })).body as StoreCheckoutVerification).issues.map((i) => i.code)).toContain("DELIVERY_NOT_OFFERED");
  });

  it("refuses to order at all while no payment provider is configured (it would only lock stock up)", async () => {
    t = buildTestApp();
    const v = (await api.verify({ lines: bag(), deliveryCode: "standard" })).body as StoreCheckoutVerification;
    expect(v.issues.map((i) => i.code)).toContain("PAYMENTS_NOT_AVAILABLE");
    expect(v.canPlaceOrder).toBe(false);
    expect((await api.place()).status).toBe(409);
    expect(await OrderModel.countDocuments()).toBe(0);
  });
});

describe("never trusting the browser", () => {
  it.each([
    ["a unit price", { lines: [{ slug: "plain-band", quantity: 1, unitPrice: 100 }] }],
    ["a line total", { lines: [{ slug: "plain-band", quantity: 1, lineTotal: 100 }] }],
    ["a discount", { discount: 5_000_000 }],
    ["a total", { total: 100 }],
    ["a stock level", { available: 999 }],
    ["a delivery fee", { deliveryFee: 0 }],
  ])("refuses a body carrying %s", async (_name, extra) => {
    const res = await api.place(extra);
    expect(res.status).toBe(400);
    expect(await OrderModel.countDocuments()).toBe(0);
    expect(await InventoryItemModel.countDocuments({ status: "RESERVED" })).toBe(0);
  });

  it("uses the total the browser reports only to notice the truth has moved — a low figure buys nothing", async () => {
    const res = await api.place({ agreedTotal: 100 });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("PRICE_CHANGED");
    expect(res.body.error.details.verification.totals.total).toBe(BAND_TOTAL);
    expect(await OrderModel.countDocuments()).toBe(0);
  });

  it("takes the price of what was placed from the server, whatever the agreed total", async () => {
    const { doc } = await placed();
    expect(doc.totals.total).toBe(BAND_TOTAL);
    expect(doc.items[0]!.unitPrice).toBe(BAND_TOTAL);
  });

  it("refuses a bad state, phone or PIN", async () => {
    for (const bad of [{ state: "Atlantis" }, { phone: "12345" }, { postalCode: "ABC" }, { email: "nope" }]) {
      expect((await api.place({ contact: { ...contact, ...bad } })).status, JSON.stringify(bad)).toBe(400);
    }
  });
});

describe("price change during checkout", () => {
  it("refuses to order at a price the customer has not seen, shows the new one, and creates nothing", async () => {
    const shown = (await api.verify({ lines: bag(), deliveryCode: "standard" })).body as StoreCheckoutVerification;
    expect(shown.totals.total).toBe(BAND_TOTAL);
    // The gold rate moves while they are typing their address.
    await createMetalRate({ metalId: w.gold, purity: "22K", ratePerGram: 700_000, effectiveFrom: new Date(Date.now() - 1000), source: "MANUAL" } as never);

    const res = await api.place({ agreedTotal: shown.totals.total });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("PRICE_CHANGED");
    expect(res.body.error.details.verification.totals.total).toBe(8_219_400);
    expect(res.body.error.details.agreedTotal).toBe(BAND_TOTAL);
    expect(await OrderModel.countDocuments()).toBe(0);
    expect(await InventoryItemModel.countDocuments({ status: "RESERVED" })).toBe(0);
  });

  it("goes through once the customer agrees to the new total — at the new price", async () => {
    await createMetalRate({ metalId: w.gold, purity: "22K", ratePerGram: 700_000, effectiveFrom: new Date(Date.now() - 1000), source: "MANUAL" } as never);
    const { doc, order } = await placed({ agreedTotal: 8_219_400 });
    expect(order.totals.total).toBe(8_219_400);
    expect(doc.items[0]!.unitPrice).toBe(8_219_400);
  });

  it("does not change the order afterwards: a later rate move leaves its price, totals and snapshot exactly as they were", async () => {
    const { order, token, doc } = await started();
    const snapshot = (await PriceSnapshotModel.findById(doc.items[0]!.priceSnapshotId).lean())!;
    expect(snapshot.unitTotal).toBe(BAND_TOTAL);
    expect((snapshot.inputs as { ratePerGram: number }).ratePerGram).toBe(650_000);
    expect(snapshot.breakdown).toMatchObject({ metalValue: 6_500_000, makingCharges: 780_000, wastageValue: 130_000, finalAmount: BAND_TOTAL, taxes: { supplyType: "INTRA_STATE", cgst: 111_150, sgst: 111_150, igst: 0 } });

    await createMetalRate({ metalId: w.gold, purity: "22K", ratePerGram: 900_000, effectiveFrom: new Date(Date.now() - 500), source: "MANUAL" } as never);
    const later = (await api.order(order, token)).body.order as StoreOrder;
    expect(later.totals.total).toBe(BAND_TOTAL);
    expect(later.items[0]).toMatchObject({ unitPrice: BAND_TOTAL, pricedWith: { ratePerGram: 650_000, purity: "22K", netWeight: 10 } });

    // …and the payment that arrives is for the frozen amount, not today's price.
    const { ref, payment } = { ref: `sbx_pay_${(await PaymentModel.findOne({ orderId: doc._id }))!.id}`, payment: null };
    void payment;
    expect(sandbox.peek(ref)!.amount).toBe(BAND_TOTAL);
  });

  it("freezes the price snapshot and the order: neither can be edited or deleted afterwards", async () => {
    const { doc } = await placed();
    await expect(PriceSnapshotModel.updateOne({ orderId: doc._id }, { $set: { unitTotal: 1 } })).rejects.toThrow(/append-only/);
    await expect(PriceSnapshotModel.deleteMany({})).rejects.toThrow(/append-only/);
    await expect(OrderModel.updateOne({ _id: doc._id }, { $set: { "totals.total": 1 } })).rejects.toThrow(/Order/);
    await expect(OrderModel.updateOne({ _id: doc._id }, { $set: { "items.0.unitPrice": 1 } })).rejects.toThrow(/Order/);
    await expect(OrderModel.findOneAndUpdate({ _id: doc._id }, { $set: { customer: { fullName: "X" } } })).rejects.toThrow(/Order/);
    await expect(OrderModel.deleteOne({ _id: doc._id })).rejects.toThrow(/Order/);
    const fresh = (await OrderModel.findById(doc._id))!;
    fresh.totals.total = 1;
    await expect(fresh.save()).rejects.toThrow(/Order/);
    expect((await OrderModel.findById(doc._id))!.totals.total).toBe(BAND_TOTAL);
  });
});

describe("placing the order: draft → held stock → awaiting payment", () => {
  it("holds exactly the pieces ordered, for this order, until the hold expires", async () => {
    const { order, doc, itemIds } = await placed({ lines: bag("plain-band", 2), agreedTotal: BAND_TOTAL * 2 });
    expect(order.status).toBe("PENDING_PAYMENT");
    expect(itemIds).toHaveLength(2);
    const items = await InventoryItemModel.find({ _id: { $in: itemIds } });
    for (const i of items) {
      expect(i.status).toBe("RESERVED");
      expect(String(i.reservation!.referenceId)).toBe(doc.id);
      expect(i.reservation!.expiresAt!.getTime()).toBeGreaterThan(Date.now() + 19 * 60_000);
    }
    expect(doc.statusHistory.map((h) => h.to)).toEqual(["DRAFT", "PENDING_PAYMENT"]);
    expect(order.canPay).toBe(true);
  });

  it("makes the held stock unavailable to the next shopper", async () => {
    await placed({ lines: bag("plain-band", 2), agreedTotal: BAND_TOTAL * 2 });
    const v = (await api.verify({ lines: bag(), deliveryCode: "standard" })).body as StoreCheckoutVerification;
    expect(v.issues.map((i) => i.code)).toEqual(["UNAVAILABLE"]);
  });

  it("gives every order a number, and nothing but a token opens it", async () => {
    const { order, token } = await placed();
    expect(order.orderNo).toMatch(/^ORD-\d{6}$/);
    expect((await api.order(order, token)).status).toBe(200);
    expect((await request(t.app).get(`/api/store/orders/${order.orderNo}`)).status).toBe(404);
    expect((await api.order(order, token.slice(2) + "xx")).status).toBe(404);
    const other = await placed({ lines: bag(), agreedTotal: BAND_TOTAL });
    expect((await api.order(order, other.token)).status).toBe(404); // someone else's token
  });

  it("keeps internal detail out of what the customer sees (no cost, margin, rule ids)", async () => {
    const { order } = await placed();
    const text = JSON.stringify(order);
    for (const secret of ["cost", "margin", "grossMargin", "estimatedCost", "ruleId", "priceSnapshotId", "requestHash", "idempotencyKey"]) expect(text).not.toContain(secret);
  });

  it("is idempotent: the same attempt sent twice is one order, one hold, one token", async () => {
    const k = key();
    const a = await api.place({ idempotencyKey: k });
    const b = await api.place({ idempotencyKey: k });
    expect(a.status).toBe(201);
    expect(b.status).toBe(200);
    expect(b.body.order.orderNo).toBe(a.body.order.orderNo);
    expect(b.body.accessToken).toBe(a.body.accessToken);
    expect(await OrderModel.countDocuments()).toBe(1);
    expect(await InventoryItemModel.countDocuments({ status: "RESERVED" })).toBe(1);
  });

  it("refuses a reused key for a different order", async () => {
    const k = key();
    await api.place({ idempotencyKey: k });
    const res = await api.place({ idempotencyKey: k, lines: bag("plain-band", 2), agreedTotal: BAND_TOTAL * 2 });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("IDEMPOTENCY_KEY_REUSED");
  });

  it("two identical requests at the same instant still make one order", async () => {
    const k = key();
    const results = await Promise.all([api.place({ idempotencyKey: k }), api.place({ idempotencyKey: k })]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 201]);
    expect(await OrderModel.countDocuments()).toBe(1);
    expect(await InventoryItemModel.countDocuments({ status: "RESERVED" })).toBe(1);
  });

  it("refuses to order a piece priced on request", async () => {
    const res = await api.place({ lines: bag("kundan-choker"), agreedTotal: 0 });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("CHECKOUT_BLOCKED");
    expect(await OrderModel.countDocuments()).toBe(0);
  });
});

describe("stock disappearing during checkout", () => {
  it("is caught when the last piece is sold between verifying and ordering — nothing is created", async () => {
    const shown = (await api.verify({ lines: bag("plain-band", 2), deliveryCode: "standard" })).body as StoreCheckoutVerification;
    expect(shown.canPlaceOrder).toBe(true);
    // Someone buys one of the two in the shop.
    const [first] = await InventoryItemModel.find({ status: "AVAILABLE", productId: await bandId() });
    await sellItems({ performedBy: someUser() }, { itemIds: [String(first!._id)], referenceType: "ORDER", referenceId: someOrder() });

    const res = await api.place({ lines: bag("plain-band", 2), agreedTotal: shown.totals.total });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("STOCK_CHANGED");
    expect(res.body.error.details.verification.issues[0]).toMatchObject({ code: "INSUFFICIENT_STOCK", slug: "plain-band" });
    expect(await OrderModel.countDocuments()).toBe(0);
    expect(await InventoryItemModel.countDocuments({ status: "RESERVED" })).toBe(0);
  });

  it("goes to exactly one of two shoppers who race for the last piece", async () => {
    await InventoryItemModel.deleteOne({ status: "AVAILABLE", productId: await bandId() }); // one band left
    const results = await Promise.all([api.place(), api.place()]);
    const codes = results.map((r) => r.status).sort();
    expect(codes).toEqual([201, 409]);
    expect(results.find((r) => r.status === 409)!.body.error.code).toBe("STOCK_CHANGED");
    expect(await InventoryItemModel.countDocuments({ status: "RESERVED" })).toBe(1);
    const live = await OrderModel.find({ status: "PENDING_PAYMENT" });
    expect(live).toHaveLength(1);
    // A loser that got as far as a draft leaves it cancelled, never holding anything.
    for (const o of await OrderModel.find({ status: { $ne: "PENDING_PAYMENT" } })) {
      expect(o.status).toBe("CANCELLED");
      expect(o.allocations).toHaveLength(0);
    }
  });

  it("is honoured or refunded when the piece goes after the order was placed: the customer paid, the piece is gone, the money goes back", async () => {
    const { order, doc, itemIds, payment, ref } = await started();
    // The hold lapses and the piece is sold over the counter before the payment lands.
    await releaseExpiredReservations(new Date(Date.now() + 60 * 60_000));
    await sellItems({ performedBy: someUser() }, { itemIds, referenceType: "ORDER", referenceId: someOrder() });

    const res = await api.webhook(sandbox.complete(ref, "CAPTURED"));
    expect(res.status).toBe(200);
    const after = (await OrderModel.findById(doc._id))!;
    expect(after.cancelReason).toBe("STOCK_UNAVAILABLE");
    expect(["CANCELLED", "REFUNDED"]).toContain(after.status);
    const pay = await paymentOf(payment.paymentId);
    expect(pay.status).toBe("REFUNDED");
    expect(pay.refundedAmount).toBe(BAND_TOTAL);
    expect(await statusOf(order)).toBe("REFUNDED");
    // The other shopper's sale stands; ours never happened.
    expect(await InventoryLedgerModel.countDocuments({ itemId: itemIds[0], movementType: "SALE" })).toBe(1);
  });
});

describe("successful payment", () => {
  it("initiates through the provider abstraction and tells the browser what to do", async () => {
    const { payment, order } = await started();
    expect(payment).toMatchObject({ provider: "sandbox", status: "PENDING", amount: BAND_TOTAL });
    expect(payment.action).toMatchObject({ type: "REDIRECT" });
    expect((payment.action as { url: string }).url).toContain(`sbx_pay_${payment.paymentId}`);
    expect(await statusOf(order)).toBe("PENDING_PAYMENT");
  });

  it("confirms the order, sells the pieces and records the money when the webhook says captured", async () => {
    const { order, token, doc, itemIds, payment, ref } = await started();
    const res = await api.webhook(sandbox.complete(ref, "CAPTURED"));
    expect(res.body).toEqual({ status: "processed", outcome: "APPLIED" });

    const after = (await OrderModel.findById(doc._id))!;
    expect(after.status).toBe("CONFIRMED");
    expect(after.statusHistory.map((h) => h.to)).toEqual(["DRAFT", "PENDING_PAYMENT", "PAID", "CONFIRMED"]);
    expect(after.paidAt).toBeInstanceOf(Date);
    expect(after.holdExpiresAt).toBeUndefined();
    expect(String(after.paymentId)).toBe(payment.paymentId);
    const pay = await paymentOf(payment.paymentId);
    expect(pay).toMatchObject({ status: "CAPTURED", capturedAmount: BAND_TOTAL, method: "sandbox-card" });
    expect(await itemStatuses(itemIds)).toEqual(["SOLD"]);
    expect(await InventoryLedgerModel.countDocuments({ itemId: itemIds[0], movementType: "SALE" })).toBe(1);
    const view = (await api.order(order, token)).body.order as StoreOrder;
    expect(view).toMatchObject({ status: "CONFIRMED", canPay: false, canCancel: true, payment: { status: "CAPTURED", amount: BAND_TOTAL } });
  });

  it("confirms the order when the customer comes back and the provider is asked — with no webhook at all", async () => {
    const { order, token, payment, ref } = await started();
    sandbox.complete(ref, "CAPTURED"); // the gateway's own state; the webhook is never delivered
    const res = await api.verifyPayment(order, token, payment.paymentId);
    expect(res.status).toBe(200);
    expect(res.body.order.status).toBe("CONFIRMED");
  });

  it("does not take the browser's word for it: a return with nothing paid changes nothing", async () => {
    const { order, token, payment } = await started();
    const res = await api.verifyPayment(order, token, payment.paymentId, { status: "captured", razorpay_payment_id: "fake" });
    expect(res.body.order.status).toBe("PENDING_PAYMENT");
    expect((await paymentOf(payment.paymentId)).status).toBe("PENDING");
  });

  it("notes an authorised payment without confirming the order until it is captured", async () => {
    const { order, payment, ref } = await started();
    await api.webhook(sandbox.complete(ref, "AUTHORIZED"));
    expect((await paymentOf(payment.paymentId)).status).toBe("AUTHORIZED");
    expect(await statusOf(order)).toBe("PENDING_PAYMENT");
    await api.webhook(sandbox.complete(ref, "CAPTURED"));
    expect((await paymentOf(payment.paymentId)).status).toBe("CAPTURED");
    expect(await statusOf(order)).toBe("CONFIRMED");
  });

  it("ignores a stale 'authorized' that arrives after 'captured'", async () => {
    const { order, payment, ref } = await started();
    await api.webhook(sandbox.complete(ref, "CAPTURED"));
    const stale = await api.webhook(sandbox.signedEvent("PAYMENT_AUTHORIZED", ref, { amount: BAND_TOTAL }));
    expect(stale.body).toEqual({ status: "processed", outcome: "IGNORED" });
    expect((await paymentOf(payment.paymentId)).status).toBe("CAPTURED");
    expect(await statusOf(order)).toBe("CONFIRMED");
  });

  it("charges the frozen order total, including delivery", async () => {
    const { payment } = await started({ deliveryCode: "express", agreedTotal: BAND_TOTAL + EXPRESS });
    expect(payment.amount).toBe(BAND_TOTAL + EXPRESS);
  });

  it("will not start a payment for an order that has already been paid or that ran out of time", async () => {
    const paid = await started();
    await api.webhook(sandbox.complete(paid.ref, "CAPTURED"));
    expect((await api.pay(paid.order, paid.token)).status).toBe(409);

    const late = await placed({ lines: bag(), agreedTotal: BAND_TOTAL });
    await OrderModel.updateOne({ _id: late.doc._id }, { $set: { holdExpiresAt: new Date(Date.now() - 1000) } });
    const res = await api.pay(late.order, late.token);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("HOLD_EXPIRED");
  });

  it("says payments are unavailable (503) rather than pretending, when no provider is registered", async () => {
    const { order, token } = await placed();
    t = buildTestApp(); // same database, an app with no gateway
    const res = await api.pay(order, token);
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe("PAYMENTS_NOT_CONFIGURED");
  });

  it("survives the gateway being down: the failed attempt is recorded and the customer can try again", async () => {
    const { order, token, doc } = await placed();
    sandbox.failNextInitiate();
    const down = await api.pay(order, token);
    expect(down.status).toBe(502);
    expect(await statusOf(order)).toBe("PAYMENT_FAILED"); // the attempt failed; the hold and the right to retry remain
    expect((await PaymentModel.findOne({ orderId: doc._id }))!.status).toBe("FAILED");
    const again = await api.pay(order, token);
    expect(again.status).toBe(201);
  });
});

describe("payment failure", () => {
  it("marks the payment and the order failed, keeps the pieces held, and lets the customer try again", async () => {
    const { order, token, doc, itemIds, payment, ref } = await started();
    await api.webhook(sandbox.complete(ref, "FAILED"));

    expect(await statusOf(order)).toBe("PAYMENT_FAILED");
    const failed = await paymentOf(payment.paymentId);
    expect(failed).toMatchObject({ status: "FAILED", failureReason: "Card declined", capturedAmount: 0 });
    expect(await itemStatuses(itemIds)).toEqual(["RESERVED"]);
    expect(await InventoryLedgerModel.countDocuments({ itemId: itemIds[0], movementType: "SALE" })).toBe(0);
    const view = (await api.order(order, token)).body.order as StoreOrder;
    expect(view).toMatchObject({ status: "PAYMENT_FAILED", canPay: true, canCancel: true });

    // Second attempt.
    const retry = await api.pay(order, token);
    expect(retry.status).toBe(201);
    expect(await statusOf(order)).toBe("PENDING_PAYMENT");
    expect((await PaymentModel.find({ orderId: doc._id }).sort({ attempt: 1 })).map((p) => [p.attempt, p.status])).toEqual([[1, "FAILED"], [2, "PENDING"]]);
    await api.webhook(sandbox.complete(`sbx_pay_${retry.body.payment.paymentId}`, "CAPTURED"));
    expect(await statusOf(order)).toBe("CONFIRMED");
  });

  it("is noticed on the customer's return even when the webhook never comes", async () => {
    const { order, token, payment, ref } = await started();
    sandbox.complete(ref, "FAILED");
    const res = await api.verifyPayment(order, token, payment.paymentId);
    expect(res.body.order.status).toBe("PAYMENT_FAILED");
  });

  it("treats closing the payment page as a failed attempt — unless the customer had in fact paid", async () => {
    const abandoned = await started();
    const res = await api.cancelPayment(abandoned.order, abandoned.token, abandoned.payment.paymentId);
    expect(res.body.order.status).toBe("PAYMENT_FAILED");
    expect((await paymentOf(abandoned.payment.paymentId)).failureReason).toBe("CUSTOMER_CANCELLED");
    expect(sandbox.peek(abandoned.ref)!.status).toBe("FAILED"); // and it can no longer be completed at the gateway

    const raced = await started();
    sandbox.complete(raced.ref, "CAPTURED");
    const res2 = await api.cancelPayment(raced.order, raced.token, raced.payment.paymentId);
    expect(res2.body.order.status).toBe("CONFIRMED");
  });

  it("honours a success that arrives for an attempt already written off, while the pieces are still held", async () => {
    const { order, payment, ref } = await started();
    await api.webhook(sandbox.complete(ref, "FAILED"));
    expect(await statusOf(order)).toBe("PAYMENT_FAILED");
    await api.webhook(sandbox.signedEvent("PAYMENT_CAPTURED", ref, { amount: BAND_TOTAL }));
    expect(await statusOf(order)).toBe("CONFIRMED");
    expect((await paymentOf(payment.paymentId)).status).toBe("CAPTURED");
  });

  it("refunds a payment for the wrong amount rather than confirming an order it does not cover", async () => {
    const { order, payment, ref } = await started();
    await api.webhook(sandbox.complete(ref, "CAPTURED", { amount: BAND_TOTAL - 50_000 }));
    expect(await statusOf(order)).toBe("PENDING_PAYMENT"); // still open: the customer can pay properly
    const pay = await paymentOf(payment.paymentId);
    expect(pay.capturedAmount).toBe(BAND_TOTAL - 50_000);
    expect(pay.status).toBe("REFUNDED");
  });
});

describe("duplicate payment webhook", () => {
  it("applies once: the same delivery twice makes one sale, one confirmation, one event", async () => {
    const { order, doc, itemIds, ref } = await started();
    const hook = sandbox.complete(ref, "CAPTURED");
    const first = await api.webhook(hook);
    const second = await api.webhook(hook);
    expect(first.body).toEqual({ status: "processed", outcome: "APPLIED" });
    expect(second.status).toBe(200); // acknowledged, so the provider stops retrying
    expect(second.body).toEqual({ status: "duplicate" });

    expect(await statusOf(order)).toBe("CONFIRMED");
    expect((await OrderModel.findById(doc._id))!.statusHistory.filter((h) => h.to === "PAID")).toHaveLength(1);
    expect(await InventoryLedgerModel.countDocuments({ itemId: itemIds[0], movementType: "SALE" })).toBe(1);
    expect(await PaymentEventModel.countDocuments()).toBe(1);
    expect((await PaymentModel.findOne({ orderId: doc._id }))!.refunds).toHaveLength(0);
  });

  it("applies once when both copies arrive at the same instant", async () => {
    const { order, doc, itemIds, ref } = await started();
    const hook = sandbox.complete(ref, "CAPTURED");
    const results = await Promise.all([api.webhook(hook), api.webhook(hook), api.webhook(hook)]);
    for (const r of results) expect(r.status).toBe(200);
    expect(await statusOf(order)).toBe("CONFIRMED");
    expect(await InventoryLedgerModel.countDocuments({ itemId: itemIds[0], movementType: "SALE" })).toBe(1);
    expect((await PaymentModel.findOne({ orderId: doc._id }))!.refunds).toHaveLength(0);
  });

  it("does not double-charge or double-sell when a provider re-sends the same fact under a new event id", async () => {
    const { order, doc, itemIds, ref } = await started();
    await api.webhook(sandbox.complete(ref, "CAPTURED"));
    const again = await api.webhook(sandbox.signedEvent("PAYMENT_CAPTURED", ref, { amount: BAND_TOTAL }));
    expect(again.body).toEqual({ status: "processed", outcome: "IGNORED" });
    expect(await statusOf(order)).toBe("CONFIRMED");
    expect(await InventoryLedgerModel.countDocuments({ itemId: itemIds[0], movementType: "SALE" })).toBe(1);
    expect((await PaymentModel.findOne({ orderId: doc._id }))!.refunds).toHaveLength(0);
  });

  it("does not double-apply a webhook that races the customer's own return", async () => {
    const { order, token, doc, itemIds, payment, ref } = await started();
    const hook = sandbox.complete(ref, "CAPTURED");
    await Promise.all([api.webhook(hook), api.verifyPayment(order, token, payment.paymentId)]);
    expect(await statusOf(order)).toBe("CONFIRMED");
    expect(await InventoryLedgerModel.countDocuments({ itemId: itemIds[0], movementType: "SALE" })).toBe(1);
    expect((await PaymentModel.findOne({ orderId: doc._id }))!.refunds).toHaveLength(0);
  });

  it("refunds a second payment for an order that is already paid (the customer paid twice)", async () => {
    const { order, token, doc, payment, ref } = await started();
    sandbox.complete(ref, "CAPTURED"); // gateway state
    // The customer opens a second payment while the first is still open, and pays both.
    const second = await api.pay(order, token);
    const ref2 = `sbx_pay_${second.body.payment.paymentId}`;
    await api.webhook(sandbox.signedEvent("PAYMENT_CAPTURED", ref, { amount: BAND_TOTAL }));
    await api.webhook(sandbox.complete(ref2, "CAPTURED"));
    expect(String((await OrderModel.findById(doc._id))!.paymentId)).toBe(payment.paymentId);
    const dup = await paymentOf(second.body.payment.paymentId);
    expect(dup.status).toBe("REFUNDED");
    expect(dup.refundedAmount).toBe(BAND_TOTAL);
  });

  it("rejects a webhook that is not signed by the provider", async () => {
    const { order, ref } = await started();
    const forged = { body: sandbox.complete(ref, "CAPTURED").body, headers: { "x-sandbox-signature": "0".repeat(64) } };
    const res = await api.webhook(forged);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("WEBHOOK_REJECTED");
    expect(await statusOf(order)).toBe("PENDING_PAYMENT");
    expect(await PaymentEventModel.countDocuments()).toBe(0);
    expect((await api.webhook({ body: "{}", headers: {} })).status).toBe(400);
  });

  it("rejects a tampered body (the signature covers the exact bytes)", async () => {
    const { order, ref } = await started();
    const hook = sandbox.complete(ref, "CAPTURED");
    const res = await api.webhook({ ...hook, body: hook.body.replace(`"amount":${BAND_TOTAL}`, `"amount":1`) });
    expect(res.status).toBe(400);
    expect(await statusOf(order)).toBe("PENDING_PAYMENT");
  });

  it("asks the provider to send again when it names a payment we don't know yet, and refuses unknown providers", async () => {
    const res = await api.webhook(sandbox.signedEvent("PAYMENT_CAPTURED", "sbx_pay_507f1f77bcf86cd799439011", { amount: 1 }));
    expect(res.status).toBe(409);
    expect(res.body.status).toBe("unknown_payment");
    expect((await api.webhook(sandbox.complete((await started()).ref, "CAPTURED"), "nosuchprovider")).status).toBe(400);
  });
});

describe("cancellation", () => {
  it("before payment frees the pieces, voids the open payment and cancels the order", async () => {
    const { order, token, itemIds, payment, ref } = await started();
    const res = await api.cancel(order, token);
    expect(res.status).toBe(200);
    expect(res.body.order).toMatchObject({ status: "CANCELLED", cancelReason: "CUSTOMER_CANCELLED", canPay: false, canCancel: false });
    expect(await itemStatuses(itemIds)).toEqual(["AVAILABLE"]);
    expect((await paymentOf(payment.paymentId)).status).toBe("FAILED");
    expect(sandbox.peek(ref)!.status).toBe("FAILED");
    // The pieces are on sale again.
    expect(((await api.verify({ lines: bag("plain-band", 2), deliveryCode: "standard" })).body as StoreCheckoutVerification).canPlaceOrder).toBe(true);
  });

  it("refunds money that arrives for an order already cancelled (a late success)", async () => {
    const { order, token, payment, ref } = await started();
    await api.cancel(order, token);
    await api.webhook(sandbox.signedEvent("PAYMENT_CAPTURED", ref, { amount: BAND_TOTAL }));
    expect(await statusOf(order)).toBe("REFUNDED");
    const pay = await paymentOf(payment.paymentId);
    expect(pay).toMatchObject({ status: "REFUNDED", capturedAmount: BAND_TOTAL, refundedAmount: BAND_TOTAL });
  });

  it("after payment returns the pieces for inspection and refunds every rupee", async () => {
    const { order, token, doc, itemIds, payment, ref } = await started();
    await api.webhook(sandbox.complete(ref, "CAPTURED"));
    const res = await api.cancel(order, token);
    expect(res.status).toBe(200);

    expect(await statusOf(order)).toBe("REFUNDED");
    expect((await OrderModel.findById(doc._id))!.statusHistory.map((h) => h.to)).toEqual(["DRAFT", "PENDING_PAYMENT", "PAID", "CONFIRMED", "CANCELLED", "REFUNDED"]);
    expect(await itemStatuses(itemIds)).toEqual(["RETURNED"]); // awaiting inspection, not silently resellable
    expect(await InventoryLedgerModel.countDocuments({ itemId: itemIds[0], movementType: "RETURN" })).toBe(1);
    const pay = await paymentOf(payment.paymentId);
    expect(pay).toMatchObject({ status: "REFUNDED", capturedAmount: BAND_TOTAL, refundedAmount: BAND_TOTAL });
    expect(pay.refunds).toHaveLength(1);
    expect(sandbox.peek(ref)!.refunds[0]).toMatchObject({ amount: BAND_TOTAL });
  });

  it("stays CANCELLED, with the refund pending, until an asynchronous provider confirms it — and a repeat confirmation does nothing", async () => {
    sandbox.setRefundMode("ASYNC");
    const { order, token, payment, ref } = await started();
    await api.webhook(sandbox.complete(ref, "CAPTURED"));
    await api.cancel(order, token);

    expect(await statusOf(order)).toBe("CANCELLED");
    let pay = await paymentOf(payment.paymentId);
    expect(pay.status).toBe("CAPTURED");
    expect(pay.refunds[0]).toMatchObject({ status: "PENDING", amount: BAND_TOTAL });

    const done = sandbox.settleRefund(ref, pay.refunds[0]!.providerRefundRef!, "SUCCEEDED");
    expect((await api.webhook(done)).body).toEqual({ status: "processed", outcome: "APPLIED" });
    expect((await api.webhook(done)).body).toEqual({ status: "duplicate" });
    pay = await paymentOf(payment.paymentId);
    expect(pay).toMatchObject({ status: "REFUNDED", refundedAmount: BAND_TOTAL });
    expect(await statusOf(order)).toBe("REFUNDED");
  });

  it("keeps the order cancelled and the failure on the payment when the gateway refuses the refund", async () => {
    sandbox.setRefundMode("FAIL");
    const { order, token, payment, ref } = await started();
    await api.webhook(sandbox.complete(ref, "CAPTURED"));
    const res = await api.cancel(order, token);
    expect(res.status).toBe(200);
    expect(await statusOf(order)).toBe("CANCELLED");
    const pay = await paymentOf(payment.paymentId);
    expect(pay.status).toBe("CAPTURED");
    expect(pay.refundedAmount).toBe(0);
    expect(pay.refunds[0]).toMatchObject({ status: "FAILED" });
    // Retryable: the amount is free to be refunded again.
    sandbox.setRefundMode("SYNC");
    await ords().payments.refund(payment.paymentId, { reason: "retry" });
    expect((await paymentOf(payment.paymentId)).status).toBe("REFUNDED");
  });

  it("is no longer possible once the parcel is packed — that is a return", async () => {
    const { order, token, doc, ref } = await started();
    await api.webhook(sandbox.complete(ref, "CAPTURED"));
    await moveOrder(doc._id, "PACKED", ["CONFIRMED"]);
    const res = await api.cancel(order, token);
    expect(res.status).toBe(409);
    expect(await statusOf(order)).toBe("PACKED");
  });

  it("cannot be done twice", async () => {
    const { order, token } = await started();
    expect((await api.cancel(order, token)).status).toBe(200);
    expect((await api.cancel(order, token)).status).toBe(409);
  });

  it("belongs to the customer holding the token", async () => {
    const { order } = await started();
    expect((await api.cancel(order, "wrong-token")).status).toBe(404);
    expect(await statusOf(order)).toBe("PENDING_PAYMENT");
  });

  it("does not cancel an order the customer has just paid for (the provider is asked first)", async () => {
    const { order, token, ref } = await started();
    sandbox.complete(ref, "CAPTURED"); // paid at the gateway; no webhook yet
    const res = await api.cancel(order, token);
    expect(res.status).toBe(200);
    expect(["REFUNDED", "CANCELLED"]).toContain(res.body.order.status);
    // It was treated as a paid order: the money went back rather than the payment being voided.
    expect((await PaymentModel.findOne({ orderId: (await OrderModel.findOne({ orderNo: order.orderNo }))!._id }))!.refundedAmount).toBe(BAND_TOTAL);
  });
});

describe("expiry", () => {
  it("cancels an order nobody paid for once the hold has run out, and puts the pieces back on sale", async () => {
    const { order, itemIds } = await started();
    const result = await ords().orders.expireStale(new Date(Date.now() + 60 * 60_000));
    expect(result).toEqual({ cancelled: 1, paidMeanwhile: 0 });
    expect(await statusOf(order)).toBe("CANCELLED");
    expect((await OrderModel.findOne({ orderNo: order.orderNo }))!.cancelReason).toBe("HOLD_EXPIRED");
    expect(await itemStatuses(itemIds)).toEqual(["AVAILABLE"]);
  });

  it("leaves an order whose hold is still running alone", async () => {
    const { order } = await started();
    expect(await ords().orders.expireStale()).toEqual({ cancelled: 0, paidMeanwhile: 0 });
    expect(await statusOf(order)).toBe("PENDING_PAYMENT");
  });

  it("does not cancel an order that was paid at the last second: the provider is asked first", async () => {
    const { order, ref } = await started();
    sandbox.complete(ref, "CAPTURED"); // paid, and the webhook is late
    const result = await ords().orders.expireStale(new Date(Date.now() + 60 * 60_000));
    expect(result).toEqual({ cancelled: 0, paidMeanwhile: 1 });
    expect(await statusOf(order)).toBe("CONFIRMED");
  });

  it("is safe to run twice", async () => {
    await started();
    const later = new Date(Date.now() + 60 * 60_000);
    await ords().orders.expireStale(later);
    expect(await ords().orders.expireStale(later)).toEqual({ cancelled: 0, paidMeanwhile: 0 });
  });
});

describe("refunds", () => {
  it("moves the payment through PARTIALLY_REFUNDED to REFUNDED, and never returns more than was taken", async () => {
    const { payment, ref } = await started();
    await api.webhook(sandbox.complete(ref, "CAPTURED"));
    await ords().payments.refund(payment.paymentId, { amount: 1_000_000, reason: "goodwill" });
    let pay = await paymentOf(payment.paymentId);
    expect(pay).toMatchObject({ status: "PARTIALLY_REFUNDED", refundedAmount: 1_000_000 });

    await expect(ords().payments.refund(payment.paymentId, { amount: BAND_TOTAL, reason: "too much" })).rejects.toThrow(/more than can still be refunded/);
    await ords().payments.refund(payment.paymentId, { reason: "the rest" });
    pay = await paymentOf(payment.paymentId);
    expect(pay).toMatchObject({ status: "REFUNDED", refundedAmount: BAND_TOTAL });
    await expect(ords().payments.refund(payment.paymentId, { reason: "again" })).rejects.toThrow(/nothing left to refund/);
  });

  it("cannot refund a payment that was never captured", async () => {
    const { payment } = await started();
    await expect(ords().payments.refund(payment.paymentId, { amount: 100, reason: "x" })).rejects.toThrow(/more than can still be refunded/);
  });

  it("two refunds racing for the same money return it once", async () => {
    const { payment, ref } = await started();
    await api.webhook(sandbox.complete(ref, "CAPTURED"));
    const results = await Promise.allSettled([ords().payments.refund(payment.paymentId, { reason: "a" }), ords().payments.refund(payment.paymentId, { reason: "b" })]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await paymentOf(payment.paymentId)).refundedAmount).toBe(BAND_TOTAL);
  });
});

describe("the ledger stays true", () => {
  it("records a sale per piece only when the order is paid, tied to the order", async () => {
    const { order, doc, itemIds, ref } = await started({ lines: bag("plain-band", 2), agreedTotal: BAND_TOTAL * 2 });
    expect(await InventoryLedgerModel.countDocuments({ itemId: { $in: itemIds }, movementType: "SALE" })).toBe(0);
    await api.webhook(sandbox.complete(ref, "CAPTURED"));
    expect(await statusOf(order)).toBe("CONFIRMED");
    expect(await InventoryLedgerModel.countDocuments({ itemId: { $in: itemIds }, movementType: "SALE" })).toBe(2);
    const entries = await InventoryLedgerModel.find({ itemId: { $in: itemIds }, movementType: "SALE" }).populate("transactionId");
    for (const e of entries) {
      const tx = e.transactionId as unknown as { referenceType: string; referenceId: { toString(): string }; channel: string };
      expect(tx).toMatchObject({ referenceType: "ORDER", channel: "B2C" });
      expect(tx.referenceId.toString()).toBe(doc.id);
    }
  });
});
