import { Types } from "mongoose";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import type { Return } from "@jewellery/types";
import { buildTestApp, createStaff, loginAs, seedRbac, bearer } from "../../test/helpers";
import { type World, makeWorld, receive, someUser } from "../../test/inventory-fixtures";
import { AuditLogModel } from "../modules/audit/audit-log.model";
import { SalesOrderModel } from "../modules/b2b/b2b.models";
import { InventoryItemModel } from "../modules/inventory/inventory-item.model";
import { InventoryLedgerModel } from "../modules/inventory/inventory-ledger.model";
import { sellItems } from "../modules/inventory/stock-operations";
import { OrderModel } from "../modules/orders/order.model";

let t: ReturnType<typeof buildTestApp>;
let w: World;
const tokens: Record<string, string> = {};

const staff = (path: string, who = "manager") => request(t.app).get(`/api/returns${path}`).set(bearer(tokens[who]!));
const staffPost = (path: string, body: object = {}, who = "manager") => request(t.app).post(`/api/returns${path}`).set(bearer(tokens[who]!)).send(body);

async function tokenFor(email: string) {
  const { accessToken, res } = await loginAs(t.app, email);
  if (!accessToken) throw new Error(`sign-in failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  return accessToken;
}

const address = { line1: "1 MG Road", city: "Mumbai", state: "Maharashtra", postalCode: "400001", country: "India" };

/** A real, sold B2C order for one item — created + immediately sold, exactly what a return needs to be checked against. */
async function soldB2COrder(over: Record<string, unknown> = {}) {
  const item = await receive(w, { locationId: w.loc.counter, ...over });
  const lineId = new Types.ObjectId();
  const order = await OrderModel.create({
    orderNo: `ORD-${Math.random().toString(36).slice(2, 8)}`,
    channel: "B2C",
    status: "CONFIRMED",
    customer: { fullName: "Asha Rao", email: "asha@test.dev", phone: "9999999999" },
    shippingAddress: address,
    delivery: { code: "STANDARD", label: "Standard", fee: 0 },
    items: [{ _id: lineId, productId: new Types.ObjectId(), slug: "gold-ring", sku: "RG-001", name: "Gold Ring", quantity: 1, priceSnapshotId: new Types.ObjectId(), unitPrice: 500000, lineTotal: 500000, taxableValue: 480000, gst: 20000 }],
    totals: { taxableValue: 480000, gst: 20000, deliveryFee: 0, total: 500000 },
    supplyType: "INTRA_STATE",
    idempotencyKey: `IDK-${Math.random().toString(36).slice(2, 8)}`,
    requestHash: "hash",
    allocations: [{ lineId, itemIds: [item.id] }],
    placedAt: new Date(),
  });
  await sellItems({ performedBy: someUser(), channel: "B2C" }, { itemIds: [item.id], referenceType: "ORDER", referenceId: order.id });
  return { order, item };
}

/** A real, sold B2B sales order for one item — allocations use lineIndex, not a subdocument id. */
async function soldB2BOrder(over: Record<string, unknown> = {}) {
  const item = await receive(w, { locationId: w.loc.counter, ...over });
  const line = { productId: new Types.ObjectId(), sku: "RG-002", name: "Silver Bangle", quantity: 1, unitTaxable: 400000, unitGst: 20000, unitTotal: 420000, lineTaxable: 400000, lineGst: 20000, lineTotal: 420000 };
  const order = await SalesOrderModel.create({
    soNo: `SO-${Math.random().toString(36).slice(2, 8)}`,
    purchaseOrderId: new Types.ObjectId(),
    poNo: "BPO-000001",
    customerId: new Types.ObjectId(),
    customerName: "Mehta Jewels",
    status: "ALLOCATED",
    lines: [line],
    totals: { taxable: 400000, gst: 20000, total: 420000, complete: true },
    shippingAddress: address,
    billingAddress: address,
    credit: { check: { ok: true } },
    allocations: [{ lineIndex: 0, itemIds: [item.id] }],
    invoiced: [],
    invoiceIds: [],
  });
  await sellItems({ performedBy: someUser(), channel: "B2B" }, { itemIds: [item.id], referenceType: "ORDER", referenceId: order.id });
  return { order, item };
}

beforeEach(async () => {
  t = buildTestApp();
  await seedRbac();
  w = await makeWorld();
  tokens.manager = await tokenFor((await createStaff("STORE_MANAGER")).email);
  tokens.exec = await tokenFor((await createStaff("SALES_EXECUTIVE")).email);
  tokens.viewer = await tokenFor((await createStaff("VIEWER")).email);
});

describe("who can reach what", () => {
  it("needs a login", async () => {
    expect((await request(t.app).get("/api/returns/dashboard")).status).toBe(401);
  });
  it("view is open to returns.view; a sales executive can request/receive/inspect but not approve or settle", async () => {
    expect((await staff("/dashboard", "viewer")).status).toBe(200);
    const { order, item } = await soldB2COrder();
    const req = await staffPost("/b2c", { orderId: order.id, itemIds: [item.id], reason: "DEFECTIVE" }, "exec");
    expect(req.status, JSON.stringify(req.body)).toBe(201);
    expect((await staffPost(`/${req.body.return.id}/approve`, {}, "exec")).status).toBe(403);
  });
});

describe("B2C: the full flow, with real ledger assertions", () => {
  it("REQUESTED -> APPROVED -> RECEIVED (SOLD->RETURNED) -> INSPECTED (RETURNED->AVAILABLE) -> SETTLED", async () => {
    const { order, item } = await soldB2COrder();
    const requested = await staffPost("/b2c", { orderId: order.id, itemIds: [item.id], reason: "SIZE_ISSUE", reasonNote: "Too small" });
    expect(requested.status, JSON.stringify(requested.body)).toBe(201);
    const ret: Return = requested.body.return;
    expect(ret.returnNo).toMatch(/^RET-\d{6}$/);
    expect(ret.status).toBe("REQUESTED");
    expect(ret.lines[0]).toMatchObject({ itemCode: item.itemCode, sku: "RG-001", orderLineRef: String(order.items[0]!._id), unitPrice: 500000 });
    expect(ret.refundableTotal).toBe(500000);
    // nothing has moved yet — still SOLD
    expect((await InventoryItemModel.findById(item.id).lean())!.status).toBe("SOLD");

    const approved = await staffPost(`/${ret.id}/approve`, { note: "Looks legitimate" });
    expect(approved.status, JSON.stringify(approved.body)).toBe(200);
    expect(approved.body.return.status).toBe("APPROVED");

    const received = await staffPost(`/${ret.id}/receive`, { destinationLocationId: w.loc.counter, lines: [{ itemId: item.id, observedHuid: undefined, observedGrossWeight: item.grossWeight }] });
    expect(received.status, JSON.stringify(received.body)).toBe(200);
    expect(received.body.return.status).toBe("RECEIVED");
    const backAfterReceive = await InventoryItemModel.findById(item.id).lean();
    expect(backAfterReceive!.status).toBe("RETURNED");
    expect(String(backAfterReceive!.locationId)).toBe(w.loc.counter);
    const ledger = await InventoryLedgerModel.find({ itemId: item.id }).sort({ sequence: 1 }).lean();
    expect(ledger.map((l) => l.movementType)).toEqual(["PURCHASE_RECEIPT", "SALE", "RETURN"]);
    expect(ledger[2]).toMatchObject({ fromStatus: "SOLD", toStatus: "RETURNED" });
    const auditReceived = await AuditLogModel.findOne({ action: "returns.received" }).lean();
    expect(auditReceived!.metadata).toMatchObject({ returnNo: ret.returnNo });

    const inspected = await staffPost(`/${ret.id}/inspect`, { lines: [{ itemId: item.id, condition: "GOOD", conditionNote: "Resellable" }] });
    expect(inspected.status, JSON.stringify(inspected.body)).toBe(200);
    expect(inspected.body.return.status).toBe("INSPECTED");
    const backAfterInspect = await InventoryItemModel.findById(item.id).lean();
    expect(backAfterInspect!.status).toBe("AVAILABLE");
    expect(await InventoryLedgerModel.countDocuments({ itemId: item.id })).toBe(4);
    expect((await InventoryLedgerModel.find({ itemId: item.id }).sort({ sequence: 1 }).lean())[3]).toMatchObject({ fromStatus: "RETURNED", toStatus: "AVAILABLE" });

    const settled = await staffPost(`/${ret.id}/settle`, { method: "REFUND", amount: 500000, reference: "TXN123" });
    expect(settled.status, JSON.stringify(settled.body)).toBe(200);
    expect(settled.body.return.status).toBe("SETTLED");
    expect(settled.body.return.settlement).toMatchObject({ method: "REFUND", amount: 500000 });
    // settlement itself moves no stock
    expect(await InventoryLedgerModel.countDocuments({ itemId: item.id })).toBe(4);
  });

  it("inspection can find the piece DAMAGED instead", async () => {
    const { order, item } = await soldB2COrder();
    const ret = (await staffPost("/b2c", { orderId: order.id, itemIds: [item.id], reason: "DEFECTIVE" })).body.return as Return;
    await staffPost(`/${ret.id}/approve`);
    await staffPost(`/${ret.id}/receive`, { destinationLocationId: w.loc.counter, lines: [{ itemId: item.id }] });
    const inspected = await staffPost(`/${ret.id}/inspect`, { lines: [{ itemId: item.id, condition: "DAMAGED", conditionNote: "Cracked stone" }] });
    expect(inspected.body.return.status).toBe("INSPECTED");
    expect((await InventoryItemModel.findById(item.id).lean())!.status).toBe("DAMAGED");
  });

  it("rejects, with no stock movement at all", async () => {
    const { order, item } = await soldB2COrder();
    const ret = (await staffPost("/b2c", { orderId: order.id, itemIds: [item.id], reason: "CHANGED_MIND" })).body.return as Return;
    const rejected = await staffPost(`/${ret.id}/reject`, { reason: "Outside the return window" });
    expect(rejected.status, JSON.stringify(rejected.body)).toBe(200);
    expect(rejected.body.return.status).toBe("REJECTED");
    expect(rejected.body.return.rejectedReason).toMatch(/return window/);
    expect((await InventoryItemModel.findById(item.id).lean())!.status).toBe("SOLD");
    expect(await InventoryLedgerModel.countDocuments({ itemId: item.id })).toBe(2); // receipt + sale only
  });

  it("can be cancelled before the piece is physically back, never after", async () => {
    const { order, item } = await soldB2COrder();
    const ret = (await staffPost("/b2c", { orderId: order.id, itemIds: [item.id], reason: "OTHER" })).body.return as Return;
    const cancelled = await staffPost(`/${ret.id}/cancel`, { reason: "Customer changed their mind about returning" });
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.return.status).toBe("CANCELLED");

    const { order: order2, item: item2 } = await soldB2COrder();
    const ret2 = (await staffPost("/b2c", { orderId: order2.id, itemIds: [item2.id], reason: "OTHER" })).body.return as Return;
    await staffPost(`/${ret2.id}/approve`);
    await staffPost(`/${ret2.id}/receive`, { destinationLocationId: w.loc.counter, lines: [{ itemId: item2.id }] });
    expect((await staffPost(`/${ret2.id}/cancel`, { reason: "too late" })).status).toBe(409);
  });

  it("refuses a piece that was not actually sold on the named order", async () => {
    const { order } = await soldB2COrder();
    const stranger = await receive(w, { locationId: w.loc.counter }); // never sold at all
    const res = await staffPost("/b2c", { orderId: order.id, itemIds: [stranger.id], reason: "DEFECTIVE" });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/not sold on order/);
  });

  it("refuses receiving a piece under a HUID that doesn't match what was sold", async () => {
    const { order, item } = await soldB2COrder({ huid: "AB12CD" });
    const ret = (await staffPost("/b2c", { orderId: order.id, itemIds: [item.id], reason: "DEFECTIVE" })).body.return as Return;
    await staffPost(`/${ret.id}/approve`);
    const mismatched = await staffPost(`/${ret.id}/receive`, { destinationLocationId: w.loc.counter, lines: [{ itemId: item.id, observedHuid: "ZZ9999" }] });
    expect(mismatched.status).toBe(409);
    expect(mismatched.body.error.message).toMatch(/cannot be received as the same item/);
    expect((await InventoryItemModel.findById(item.id).lean())!.status).toBe("SOLD"); // refused before anything moved
  });

  it("a weight that has drifted needs a note to receive", async () => {
    const { order, item } = await soldB2COrder();
    const ret = (await staffPost("/b2c", { orderId: order.id, itemIds: [item.id], reason: "DEFECTIVE" })).body.return as Return;
    await staffPost(`/${ret.id}/approve`);
    const noNote = await staffPost(`/${ret.id}/receive`, { destinationLocationId: w.loc.counter, lines: [{ itemId: item.id, observedGrossWeight: item.grossWeight + 2 }] });
    expect(noNote.status).toBe(400);
    const withNote = await staffPost(`/${ret.id}/receive`, { destinationLocationId: w.loc.counter, lines: [{ itemId: item.id, observedGrossWeight: item.grossWeight + 2, weightDiscrepancyNote: "Re-weighed 2g heavier — clasp added" }] });
    expect(withNote.status, JSON.stringify(withNote.body)).toBe(200);
  });

  it("refuses a second open return against a piece that already has one", async () => {
    const { order, item } = await soldB2COrder();
    const first = await staffPost("/b2c", { orderId: order.id, itemIds: [item.id], reason: "DEFECTIVE" });
    expect(first.status).toBe(201);
    const second = await staffPost("/b2c", { orderId: order.id, itemIds: [item.id], reason: "OTHER" });
    expect(second.status).toBe(409);
  });
});

describe("B2B: identical discipline against a sales order", () => {
  it("resolves the exact item from the sales order's own allocations and moves it through the same ledger", async () => {
    const { order, item } = await soldB2BOrder();
    const ret = (await staffPost("/b2b", { orderId: order.id, itemIds: [item.id], reason: "NOT_AS_DESCRIBED" })).body.return as Return;
    expect(ret.channel).toBe("B2B");
    expect(ret.orderNo).toBe(order.soNo);
    expect(ret.lines[0]).toMatchObject({ sku: "RG-002", orderLineRef: "0" });

    await staffPost(`/${ret.id}/approve`);
    const received = await staffPost(`/${ret.id}/receive`, { destinationLocationId: w.loc.counter, lines: [{ itemId: item.id }] });
    expect(received.status, JSON.stringify(received.body)).toBe(200);
    expect((await InventoryItemModel.findById(item.id).lean())!.status).toBe("RETURNED");
  });
});
