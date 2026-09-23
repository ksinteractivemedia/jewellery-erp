import { Types } from "mongoose";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { buildTestApp, createStaff, loginAs, seedRbac, bearer } from "../../test/helpers";
import { type World, makeWorld, receive, someUser } from "../../test/inventory-fixtures";
import { SalesOrderModel } from "../modules/b2b/b2b.models";
import { createCustomer } from "../modules/customers/customer.repository";
import { sellItems } from "../modules/inventory/stock-operations";
import { orderAccessToken } from "../modules/orders/order-access";
import { OrderModel } from "../modules/orders/order.model";
import { createUser } from "../modules/auth/user.service";

let t: ReturnType<typeof buildTestApp>;
let w: World;

const address = { line1: "1 MG Road", city: "Mumbai", state: "Maharashtra", postalCode: "400001", country: "India" };

async function soldB2COrder() {
  const item = await receive(w, { locationId: w.loc.counter });
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

async function soldB2BOrder(customerId: string) {
  const item = await receive(w, { locationId: w.loc.counter });
  const line = { productId: new Types.ObjectId(), sku: "RG-002", name: "Silver Bangle", quantity: 1, unitTaxable: 400000, unitGst: 20000, unitTotal: 420000, lineTaxable: 400000, lineGst: 20000, lineTotal: 420000 };
  const order = await SalesOrderModel.create({
    soNo: `SO-${Math.random().toString(36).slice(2, 8)}`,
    purchaseOrderId: new Types.ObjectId(),
    poNo: "BPO-000001",
    customerId: new Types.ObjectId(customerId),
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
});

describe("B2C storefront — a guest may request a return against their own order, by its own line, never an internal item id", () => {
  it("refuses without the right order token", async () => {
    const { order } = await soldB2COrder();
    const res = await request(t.app).post(`/api/store/orders/${order.orderNo}/returns`).send({ lineRefs: [String(order.items[0]!._id)], reason: "DEFECTIVE" });
    expect(res.status).toBe(404); // a wrong/missing token is indistinguishable from no such order
  });

  it("requests a return with the real order token, and lists it back", async () => {
    const { order, item } = await soldB2COrder();
    const token = orderAccessToken(t.config.auth.accessSecret, order.id);
    const res = await request(t.app).post(`/api/store/orders/${order.orderNo}/returns`).set("X-Order-Token", token).send({ lineRefs: [String(order.items[0]!._id)], reason: "SIZE_ISSUE" });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.return).toMatchObject({ channel: "B2C", status: "REQUESTED", orderNo: order.orderNo });
    expect(res.body.return.lines[0]).toMatchObject({ itemCode: item.itemCode });

    // a request body naming an orderId or a raw InventoryItem id is refused outright — strict schema, no such fields on this endpoint
    const smuggled = await request(t.app).post(`/api/store/orders/${order.orderNo}/returns`).set("X-Order-Token", token).send({ orderId: order.id, itemIds: [item.id], reason: "OTHER" });
    expect(smuggled.status).toBe(400);

    const list = await request(t.app).get(`/api/store/orders/${order.orderNo}/returns`).set("X-Order-Token", token);
    expect(list.status, JSON.stringify(list.body)).toBe(200);
    expect(list.body.items).toHaveLength(1);
  });
});

describe("B2B portal — a buyer may request a return against their own sales order, never another customer's", () => {
  it("scopes strictly to the buyer's own customer id, from the database", async () => {
    const customer = await createCustomer({ type: "B2B", name: "Mehta Jewels", email: "accounts@mehta.test" } as never);
    const other = await createCustomer({ type: "B2B", name: "Someone Else", email: "accounts@someoneelse.test" } as never);
    await createUser({ email: "buyer@mehta.test", password: "Correct-Horse-9", name: "Buyer", userType: "B2B_BUYER", customerId: customer.id } as never);
    const { accessToken } = await loginAs(t.app, "buyer@mehta.test");

    const { order: mine } = await soldB2BOrder(customer.id);
    const { order: notMine } = await soldB2BOrder(other.id);

    const denied = await request(t.app).post(`/api/portal/orders/${notMine.id}/returns`).set(bearer(accessToken!)).send({ lineRefs: ["0"], reason: "OTHER" });
    expect(denied.status).toBe(404); // reads.salesOrder is the ownership check — cannot even name another customer's order

    const res = await request(t.app).post(`/api/portal/orders/${mine.id}/returns`).set(bearer(accessToken!)).send({ lineRefs: ["0"], reason: "NOT_AS_DESCRIBED" });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.return).toMatchObject({ channel: "B2B", status: "REQUESTED" });

    const list = await request(t.app).get(`/api/portal/orders/${mine.id}/returns`).set(bearer(accessToken!));
    expect(list.status, JSON.stringify(list.body)).toBe(200);
    expect(list.body.items).toHaveLength(1);
  });

  it("staff cannot use the buyer-only portal door", async () => {
    const staff = await createStaff("B2B_MANAGER");
    const { accessToken } = await loginAs(t.app, staff.email);
    const res = await request(t.app).get("/api/portal/dashboard").set(bearer(accessToken!));
    expect(res.status).toBe(403);
  });
});
