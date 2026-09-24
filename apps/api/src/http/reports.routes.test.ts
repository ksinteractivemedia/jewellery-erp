import request from "supertest";
import { Types } from "mongoose";
import { beforeEach, describe, expect, it } from "vitest";
import { ALL_ROLE_NAMES, PERMISSIONS as P, ROLE_NAMES as R, REPORT_KEYS } from "@jewellery/types";
import { bearer, buildTestApp, createStaff, loginAs, seedRbac } from "../../test/helpers";
import { type World, makeWorld, receive, someUser } from "../../test/inventory-fixtures";
import { DEFAULT_ROLE_MATRIX } from "../modules/auth/rbac/role-matrix";
import { OrderModel } from "../modules/orders/order.model";
import { InvoiceModel, PurchaseOrderModel, SalesOrderModel } from "../modules/b2b/b2b.models";
import { CustomerModel } from "../modules/customers/customer.model";
import { InventoryItemModel } from "../modules/inventory/inventory-item.model";
import { reserveItems, sellItems } from "../modules/inventory/stock-operations";
import { approveReturn, receiveReturn, requestReturn } from "../modules/returns/return.service";
import { createProductCategory } from "../modules/catalog/product-category.repository";
import { createProduct } from "../modules/catalog/product.repository";

let t: ReturnType<typeof buildTestApp>;
let w: World;
const tokens: Record<string, string> = {};

const address = { line1: "1 MG Road", city: "Mumbai", state: "Maharashtra", postalCode: "400001", country: "India" };

const get = (path: string, who = "admin") => request(t.app).get(`/api/reports${path}`).set(bearer(tokens[who]!));

async function tokenFor(email: string) {
  const { accessToken, res } = await loginAs(t.app, email);
  if (!accessToken) throw new Error(`sign-in failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  return accessToken;
}

/** A real, sold B2C order for one item — allocated + sold through the real ledger, exactly like the storefront checkout path. */
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
    items: [{ _id: lineId, productId: new Types.ObjectId(), slug: "gold-ring", sku: "RG-001", name: "Gold Ring", quantity: 1, priceSnapshotId: new Types.ObjectId(), unitPrice: 500_000, lineTotal: 500_000, taxableValue: 480_000, gst: 20_000 }],
    totals: { taxableValue: 480_000, gst: 20_000, deliveryFee: 0, total: 500_000 },
    supplyType: "INTRA_STATE",
    idempotencyKey: `IDK-${Math.random().toString(36).slice(2, 8)}`,
    requestHash: "hash",
    allocations: [{ lineId, itemIds: [item.id] }],
    placedAt: new Date(),
  });
  await sellItems({ performedBy: someUser(), channel: "B2C" }, { itemIds: [item.id], referenceType: "ORDER", referenceId: order.id });
  return { order, item };
}

/** A real, sold B2B sales order + issued invoice for one item, against a real Customer (so salesperson/credit reports have someone to resolve). */
async function soldB2BOrder(customer: { id: string; name: string }, over: Record<string, unknown> = {}) {
  const item = await receive(w, { locationId: w.loc.counter, ...over });
  const line = { productId: new Types.ObjectId(), sku: "RG-002", name: "Silver Bangle", quantity: 1, unitMaking: 0, unitDiscount: 20_000, unitTaxable: 400_000, unitGst: 20_000, unitTotal: 420_000, lineMaking: 0, lineDiscount: 20_000, lineTaxable: 400_000, lineGst: 20_000, lineTotal: 420_000 };
  const order = await SalesOrderModel.create({
    soNo: `SO-${Math.random().toString(36).slice(2, 8)}`,
    purchaseOrderId: new Types.ObjectId(),
    poNo: "BPO-000001",
    customerId: customer.id,
    customerName: customer.name,
    status: "ALLOCATED",
    lines: [line],
    totals: { taxable: 400_000, gst: 20_000, total: 420_000, complete: true },
    shippingAddress: address,
    billingAddress: address,
    credit: { check: { ok: true } },
    allocations: [{ lineIndex: 0, itemIds: [item.id] }],
    invoiced: [],
    invoiceIds: [],
  });
  await sellItems({ performedBy: someUser(), channel: "B2B" }, { itemIds: [item.id], referenceType: "ORDER", referenceId: order.id });
  const invoice = await InvoiceModel.create({
    invoiceNo: `INV-${Math.random().toString(36).slice(2, 8)}`,
    salesOrderId: order._id,
    soNo: order.soNo,
    customerId: customer.id,
    customerName: customer.name,
    issueDate: new Date().toISOString().slice(0, 10),
    dueDate: "2020-01-01", // long overdue by design, so outstanding/ageing reports have something to show
    lines: [line],
    totals: { taxable: 400_000, gst: 20_000, total: 420_000, complete: true },
    taxes: { supplyType: "INTRA_STATE", cgst: 10_000, sgst: 10_000, igst: 0 },
    shippingAddress: address,
    billingAddress: address,
    sequence: 1,
    status: "ISSUED",
    ...over,
  });
  return { order, item, invoice };
}

async function b2bCustomer(over: Record<string, unknown> = {}) {
  return CustomerModel.create({ type: "B2B", name: "Mehta Jewels", b2b: { creditLimit: 1_000_000, paymentTermsDays: 30 }, ...over });
}

beforeEach(async () => {
  t = buildTestApp();
  await seedRbac();
  w = await makeWorld();
  tokens.admin = await tokenFor((await createStaff(R.ADMIN)).email);
  tokens.warehouse = await tokenFor((await createStaff(R.WAREHOUSE_MANAGER)).email);
  tokens.production = await tokenFor((await createStaff(R.PRODUCTION_MANAGER)).email);
});

describe("authorization — every report sits behind reports.view, nothing else", () => {
  it("refuses an unauthenticated caller", async () => {
    expect((await request(t.app).get("/api/reports/registry")).status).toBe(401);
    expect((await request(t.app).get("/api/reports/sales-daily")).status).toBe(401);
  });

  it("allows every role exactly where the matrix grants reports.view (13 roles)", async () => {
    for (const role of ALL_ROLE_NAMES) {
      const { email } = await createStaff(role, { email: `probe.${role.toLowerCase()}@example.test` });
      const token = await tokenFor(email);
      const allowed = DEFAULT_ROLE_MATRIX[role].includes(P.REPORTS_VIEW);
      const res = await request(t.app).get("/api/reports/registry").set(bearer(token));
      expect(res.status, role).toBe(allowed ? 200 : 403);
    }
  });

  it("a role without reports.view (warehouse manager) is refused on every door, including export", async () => {
    expect((await get("/registry", "warehouse")).status).toBe(403);
    expect((await get("/sales-daily", "warehouse")).status).toBe(403);
    expect((await get("/sales-daily/export", "warehouse")).status).toBe(403);
  });
});

describe("registry — one row per report, driving the ERP's index page", () => {
  it("lists every report key from the shared type, with a title and columns", async () => {
    const res = await get("/registry");
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(REPORT_KEYS.length);
    const keys = res.body.items.map((r: { key: string }) => r.key);
    for (const k of REPORT_KEYS) expect(keys, k).toContain(k);
    const daily = res.body.items.find((r: { key: string }) => r.key === "sales-daily");
    expect(daily).toMatchObject({ category: "SALES", title: "Daily Sales" });
    expect(daily.columns.length).toBeGreaterThan(0);
  });
});

describe("query validation — every report shares the same filter contract", () => {
  it("404s an unknown report key", async () => {
    const res = await get("/not-a-real-report");
    expect(res.status).toBe(404);
  });

  it.each([
    ["a malformed date", "from=20-09-2026&to=2026-09-20"],
    ["a day that does not exist", "from=2026-02-30&to=2026-03-02"],
    ["from after to", "from=2026-09-10&to=2026-09-01"],
    ["a range over a year", "from=2025-01-01&to=2026-09-20"],
    ["a bad branch id", "branchId=main"],
    ["a bad location id", "locationId=counter"],
    ["pageSize beyond the cap", "pageSize=5000"],
  ])("%s → 400", async (_name, query) => {
    const res = await get(`/sales-daily?${query}`);
    expect(res.status, JSON.stringify(res.body)).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("404s an unknown location or branch, honouring the same scope resolution as the dashboard", async () => {
    expect((await get("/inventory-by-sku?locationId=64b0c0ffee0000000000aaaa")).status).toBe(404);
    expect((await get("/inventory-by-sku?branchId=64b0c0ffee0000000000aaaa")).status).toBe(404);
  });

  it("leaks no database internals", async () => {
    await soldB2COrder();
    const text = JSON.stringify((await get("/sales-daily")).body);
    expect(text).not.toMatch(/"_id"|"__v"|passwordHash/);
  });
});

describe("sales reports", () => {
  it("daily sales sums real, paid B2C orders and real, issued B2B invoices into one total", async () => {
    await soldB2COrder();
    const customer = await b2bCustomer();
    await soldB2BOrder({ id: String(customer._id), name: customer.name });

    const res = await get("/sales-daily");
    expect(res.status).toBe(200);
    const grand = res.body.rows.reduce((s: number, r: { total: number }) => s + r.total, 0);
    expect(grand).toBe(500_000 + 420_000);
    expect(res.body.summary.find((s: { label: string }) => s.label === "Orders").value).toBe(2);
  });

  it("B2C-only and B2B-only sales reports each see only their own channel", async () => {
    await soldB2COrder();
    const customer = await b2bCustomer();
    await soldB2BOrder({ id: String(customer._id), name: customer.name });

    const b2c = await get("/sales-b2c");
    expect(b2c.body.rows.reduce((s: number, r: { total: number }) => s + r.total, 0)).toBe(500_000);
    const b2b = await get("/sales-b2b");
    expect(b2b.body.rows.reduce((s: number, r: { total: number }) => s + r.total, 0)).toBe(420_000);
    // B2B rows carry a discount column B2C rows don't need
    expect(b2b.body.rows[0]).toHaveProperty("discount");
  });

  it("monthly sales rolls the same figures up to a month bucket", async () => {
    await soldB2COrder();
    const res = await get("/sales-monthly");
    expect(res.status).toBe(200);
    expect(res.body.rows.reduce((s: number, r: { total: number }) => s + r.total, 0)).toBe(500_000);
  });

  it("sales by product groups by SKU across both channels", async () => {
    await soldB2COrder();
    const res = await get("/sales-by-product");
    expect(res.status).toBe(200);
    expect(res.body.rows).toContainEqual(expect.objectContaining({ sku: "RG-001", quantity: 1, total: 500_000 }));
  });

  it("sales by category rolls product-level sales up via the catalogue, uncategorised when no product record matches", async () => {
    await soldB2COrder();
    const res = await get("/sales-by-category");
    expect(res.status).toBe(200);
    expect(res.body.rows).toContainEqual(expect.objectContaining({ categoryName: "Uncategorised", total: 500_000 }));
  });

  it("sales by category attributes real product sales to their real category", async () => {
    const category = await createProductCategory({ name: "Bangles" });
    const product = await createProduct({ sku: "BG-100", name: "Gold Bangle", categoryId: category.id, metalId: w.gold, purity: "22K", defaultGrossWeight: 10, defaultNetWeight: 10, isActive: true, images: [] } as never);
    const item = await receive(w, { locationId: w.loc.counter });
    const lineId = new Types.ObjectId();
    const order = await OrderModel.create({
      orderNo: `ORD-${Math.random().toString(36).slice(2, 8)}`,
      channel: "B2C",
      status: "PAID",
      customer: { fullName: "Kiran Shah", email: "kiran@test.dev", phone: "9999999998" },
      shippingAddress: address,
      delivery: { code: "STANDARD", label: "Standard", fee: 0 },
      items: [{ _id: lineId, productId: new Types.ObjectId(product.id), slug: "gold-bangle", sku: "BG-100", name: "Gold Bangle", quantity: 1, priceSnapshotId: new Types.ObjectId(), unitPrice: 300_000, lineTotal: 300_000, taxableValue: 290_000, gst: 10_000 }],
      totals: { taxableValue: 290_000, gst: 10_000, deliveryFee: 0, total: 300_000 },
      supplyType: "INTRA_STATE",
      idempotencyKey: `IDK-${Math.random().toString(36).slice(2, 8)}`,
      requestHash: "hash",
      allocations: [{ lineId, itemIds: [item.id] }],
      placedAt: new Date(),
    });
    await sellItems({ performedBy: someUser(), channel: "B2C" }, { itemIds: [item.id], referenceType: "ORDER", referenceId: order.id });

    const byCategory = await get("/sales-by-category");
    expect(byCategory.body.rows).toContainEqual(expect.objectContaining({ categoryName: "Bangles", total: 300_000 }));

    const byProductFiltered = await get(`/sales-by-product?categoryId=${category.id}`);
    expect(byProductFiltered.body.rows).toEqual([expect.objectContaining({ sku: "BG-100" })]);
  });

  it("sales by salesperson attributes B2B revenue to the customer's assigned salesperson, or 'Unassigned'", async () => {
    const customer = await b2bCustomer();
    await soldB2BOrder({ id: String(customer._id), name: customer.name });
    const res = await get("/sales-by-salesperson");
    expect(res.status).toBe(200);
    expect(res.body.rows).toContainEqual(expect.objectContaining({ salespersonName: "Unassigned", total: 420_000 }));
  });

  it("sales by branch attributes revenue to the real dispatch location, read off the ledger", async () => {
    await soldB2COrder({ locationId: w.loc.counter });
    const res = await get("/sales-by-branch");
    expect(res.status).toBe(200);
    expect(res.body.rows[0]).toMatchObject({ pieces: 1, total: 500_000 });
    expect(res.body.rows[0].branchName).toContain("Main Store");

    const scoped = await get(`/sales-by-branch?locationId=${w.loc.counter}`);
    expect(scoped.status).toBe(200);
  });
});

describe("inventory reports", () => {
  it("stock by SKU, location, metal, purity and value all report the same real owned stock, sliced differently", async () => {
    await receive(w, { grossWeight: 10, locationId: w.loc.counter });
    await receive(w, { grossWeight: 20, locationId: w.loc.warehouse });

    const bySku = await get("/inventory-by-sku");
    expect(bySku.body.rows.reduce((s: number, r: { quantity: number }) => s + r.quantity, 0)).toBe(2);

    const byLocation = await get("/inventory-by-location");
    expect(byLocation.body.rows).toHaveLength(2);

    const byMetal = await get("/inventory-by-metal");
    expect(byMetal.body.rows).toContainEqual(expect.objectContaining({ metalName: "Gold", quantity: 2 }));

    const byPurity = await get("/inventory-by-purity");
    expect(byPurity.body.rows).toContainEqual(expect.objectContaining({ purity: "22K", quantity: 2 }));

    const value = await get("/inventory-value");
    expect(value.body.rows).toContainEqual(expect.objectContaining({ statusLabel: "Available", quantity: 2 }));
    expect(value.body.summary[0].value).toBe(100_000_00); // 2 x 50,000.00 default cost from the fixture

    const scoped = await get(`/inventory-by-location?locationId=${w.loc.counter}`);
    expect(scoped.body.rows).toHaveLength(1);
    expect(scoped.body.rows[0].quantity).toBe(1);
  });

  it("reserved stock lists every piece currently held for something, with where and since when", async () => {
    const item = await receive(w, { locationId: w.loc.counter });
    await reserveItems({ performedBy: someUser() }, { itemIds: [item.id], referenceId: someUser() });

    const res = await get("/inventory-reserved");
    expect(res.status).toBe(200);
    expect(res.body.rows).toHaveLength(1);
    expect(res.body.rows[0]).toMatchObject({ itemCode: item.itemCode, locationName: "Counter" });
    expect(res.body.summary[0]).toMatchObject({ label: "Reserved pieces", value: 1 });
  });

  it("dead stock finds available finished jewellery that hasn't moved in a long time", async () => {
    const fresh = await receive(w, { locationId: w.loc.counter });
    const stale = await receive(w, { locationId: w.loc.counter });
    // Bypass Mongoose's own `timestamps` plugin (it re-stamps `updatedAt` on `updateOne`) by writing through the native driver.
    await InventoryItemModel.collection.updateOne({ _id: new Types.ObjectId(stale.id) }, { $set: { updatedAt: new Date(Date.now() - 200 * 86_400_000) } });

    const res = await get("/inventory-dead-stock");
    expect(res.status).toBe(200);
    const codes = res.body.rows.map((r: { itemCode: string }) => r.itemCode);
    expect(codes).toContain(stale.itemCode);
    expect(codes).not.toContain(fresh.itemCode);
    expect(res.body.rows[0].daysIdle).toBeGreaterThanOrEqual(200);
  });
});

describe("gold reports", () => {
  it("gold purchased reflects real PURCHASE_RECEIPT ledger entries, at the piece's fine weight", async () => {
    await receive(w, { grossWeight: 10, purity: "22K" });
    const res = await get("/gold-purchased");
    expect(res.status).toBe(200);
    expect(res.body.rows).toHaveLength(1);
    expect(res.body.rows[0]).toMatchObject({ purity: "22K", grossWeight: 10 });
    expect(res.body.summary[0].value).toBeCloseTo(10 * 0.916, 3);
  });

  it("gold sold and gold returned track a piece through a real sale and a real customer return", async () => {
    const { order, item } = await soldB2COrder({ grossWeight: 10 });

    const sold = await get("/gold-sold");
    expect(sold.body.rows).toHaveLength(1);
    expect(sold.body.rows[0].itemCode).toBe(item.itemCode);

    const ret = await requestReturn({ id: someUser(), name: "Ops" }, "B2C", { orderId: order.id, itemIds: [item.id], reason: "DEFECTIVE" });
    await approveReturn(ret.id, { id: someUser(), name: "Ops" });
    await receiveReturn(ret.id, { id: someUser(), name: "Ops" }, { destinationLocationId: w.loc.counter, lines: [{ itemId: item.id }] });

    const returned = await get("/gold-returned");
    expect(returned.status).toBe(200);
    expect(returned.body.rows).toHaveLength(1);
    expect(returned.body.rows[0].itemCode).toBe(item.itemCode);
  });

  it("gold fine balance is a snapshot of current owned gold by status", async () => {
    await receive(w, { grossWeight: 10, purity: "22K" });
    const res = await get("/gold-fine-balance");
    expect(res.status).toBe(200);
    expect(res.body.rows).toContainEqual(expect.objectContaining({ statusLabel: "Available", quantity: 1 }));
  });

  describe("issued, consumed and wastage — from a real production order taken to completion", () => {
    async function productionThroughToCompletion() {
      const rings = await createProductCategory({ name: "Rings" });
      const product = await createProduct({ sku: "RING-MFG-1", name: "Signature Band", categoryId: rings.id, metalId: w.gold, purity: "22K", defaultGrossWeight: 10, defaultNetWeight: 10, isActive: true, images: [] } as never);
      const batch = await receive(w, { type: "RAW_MATERIAL", serialization: "BATCH", grossWeight: 500, stoneWeight: 0, locationId: w.loc.warehouse, cost: 30_00_000 });
      const bom = { metalId: w.gold, purity: "22K", expectedGrossWeight: 500, expectedWastage: 10 };
      const mfg = (path: string, body: object = {}) => request(t.app).post(`/api/manufacturing${path}`).set(bearer(tokens.production!)).send(body);

      const created = await mfg("/production-orders", { productId: product.id, quantity: 1, locationId: w.loc.workshop, bom });
      expect(created.status, JSON.stringify(created.body)).toBe(201);
      const poId = created.body.productionOrder.id;

      expect((await mfg(`/production-orders/${poId}/issue-material`, { itemIds: [batch.id] })).status).toBe(200);
      expect((await mfg(`/production-orders/${poId}/start`)).status).toBe(200);
      expect((await mfg(`/production-orders/${poId}/submit-qc`, { actualGrossWeight: 490, actualWastage: 8, labourCost: 6_000_00 })).status).toBe(200);
      expect((await mfg(`/production-orders/${poId}/qc/pass`, { notes: "Within tolerance" })).status).toBe(200);
      const completed = await mfg(`/production-orders/${poId}/complete`, { finishedPieces: [{ grossWeight: 480, stoneWeight: 0, quantity: 1 }], returnedItemIds: [], wastage: 20 });
      expect(completed.status, JSON.stringify(completed.body)).toBe(200);
      return completed.body.productionOrder;
    }

    it("gold issued reports the MANUFACTURING_ISSUE leg", async () => {
      await productionThroughToCompletion();
      const res = await get("/gold-issued");
      expect(res.status).toBe(200);
      expect(res.body.rows).toHaveLength(1);
      expect(res.body.rows[0].grossWeight).toBe(500);
    });

    it("gold consumed reports the new finished piece the MANUFACTURING_RECEIPT created, not any returned-material leg", async () => {
      await productionThroughToCompletion();
      const res = await get("/gold-consumed");
      expect(res.status).toBe(200);
      expect(res.body.rows).toHaveLength(1);
      expect(res.body.rows[0].grossWeight).toBe(480);
    });

    it("gold wastage reads the order's own reconciliation, never a ledger guess", async () => {
      const po = await productionThroughToCompletion();
      const res = await get("/gold-wastage");
      expect(res.status).toBe(200);
      expect(res.body.rows).toContainEqual(expect.objectContaining({ orderNo: po.productionOrderNo, kind: "Production", wastageGrossWeight: 20, discrepancyGrossWeight: 0 }));
      expect(res.body.summary[0]).toMatchObject({ label: "Total wastage", value: 20 });
    });
  });
});

describe("B2B reports", () => {
  it("customer sales sums issued invoices per customer", async () => {
    const customer = await b2bCustomer();
    await soldB2BOrder({ id: String(customer._id), name: customer.name });
    const res = await get("/b2b-customer-sales");
    expect(res.status).toBe(200);
    expect(res.body.rows).toContainEqual(expect.objectContaining({ customerName: "Mehta Jewels", invoices: 1, total: 420_000 }));
  });

  it("outstanding and ageing are thin wrappers over the accounting module's own reads — never re-derived math", async () => {
    const customer = await b2bCustomer();
    const { invoice } = await soldB2BOrder({ id: String(customer._id), name: customer.name });

    const outstanding = await get("/b2b-outstanding");
    expect(outstanding.status).toBe(200);
    expect(outstanding.body.rows).toContainEqual(expect.objectContaining({ invoiceNo: invoice.invoiceNo, balance: 420_000 }));

    const ageing = await get("/b2b-ageing");
    expect(ageing.status).toBe(200);
    const row = ageing.body.rows.find((r: { customerName: string }) => r.customerName === "Mehta Jewels");
    expect(row.total).toBe(420_000);
    expect(row.over90).toBe(420_000); // dueDate 2020-01-01 is long over 90 days overdue
  });

  it("credit utilization reports every B2B customer's real credit position", async () => {
    const customer = await b2bCustomer({ b2b: { creditLimit: 1_000_000, paymentTermsDays: 30 } });
    await soldB2BOrder({ id: String(customer._id), name: customer.name });
    const res = await get("/b2b-credit-utilization");
    expect(res.status).toBe(200);
    expect(res.body.rows).toContainEqual(expect.objectContaining({ customerName: "Mehta Jewels", limit: 1_000_000, outstanding: 420_000 }));
  });

  it("PO pipeline groups every wholesale purchase order by its current status", async () => {
    const customer = await b2bCustomer();
    await PurchaseOrderModel.create({
      poNo: "BPO-100001",
      customerId: customer._id,
      customerName: customer.name,
      status: "UNDER_REVIEW",
      lines: [{ productId: new Types.ObjectId(), sku: "RG-003", name: "Chain", quantity: 2, unitMaking: 0, unitDiscount: 0, unitTaxable: 100_000, unitGst: 5_000, unitTotal: 105_000, lineMaking: 0, lineDiscount: 0, lineTaxable: 200_000, lineGst: 10_000, lineTotal: 210_000 }],
      totals: { taxable: 200_000, gst: 10_000, total: 210_000, complete: true },
      shippingAddress: address,
      billingAddress: address,
    });
    const res = await get("/b2b-po-pipeline");
    expect(res.status).toBe(200);
    expect(res.body.rows).toContainEqual(expect.objectContaining({ statusLabel: "UNDER REVIEW", count: 1, total: 210_000 }));
  });
});

describe("profitability", () => {
  it("computes revenue, cost, gross profit and margin from real order/invoice totals and real item cost", async () => {
    await soldB2COrder({ grossWeight: 10, cost: 50_000_00 });
    const res = await get("/profitability-summary");
    expect(res.status).toBe(200);
    expect(res.body.summary).toContainEqual({ label: "Net revenue", value: 480_000, format: "money" });
    expect(res.body.summary).toContainEqual({ label: "Cost of goods sold", value: 50_000_00, format: "money" });
    const grossProfit = res.body.summary.find((s: { label: string }) => s.label === "Gross profit");
    expect(grossProfit.value).toBe(480_000 - 50_000_00);
  });

  it("groups by month when asked", async () => {
    await soldB2COrder();
    const res = await get("/profitability-summary?groupBy=month");
    expect(res.status).toBe(200);
    expect(res.body.scope.groupBy).toBe("month");
    expect(res.body.rows[0].period).toMatch(/^\d{4}-\d{2}$/);
  });
});

describe("pagination", () => {
  it("paginates a grouped report and reports the real total row count, not just the page", async () => {
    for (let i = 0; i < 3; i++) await receive(w, { locationId: w.loc.counter, grossWeight: 5 + i });
    const page1 = await get("/inventory-by-sku?pageSize=1&page=1");
    expect(page1.body.rows).toHaveLength(1);
    expect(page1.body.total).toBeGreaterThanOrEqual(1);
    expect(page1.body.page).toBe(1);
    expect(page1.body.pageSize).toBe(1);
  });
});

describe("CSV export", () => {
  it("streams a CSV file, capped, rather than the browser rendering a huge JSON array", async () => {
    await soldB2COrder();
    const res = await get("/sales-daily/export");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/^text\/csv/);
    expect(res.headers["content-disposition"]).toBe('attachment; filename="sales-daily.csv"');
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    const lines = res.text.trim().split("\r\n");
    expect(lines[0]).toBe("Date,Orders,Taxable value,GST,Total");
    expect(lines.length).toBeGreaterThanOrEqual(2);
  });

  it("escapes a comma or quote in a cell", async () => {
    const customer = await b2bCustomer({ name: 'Mehta "Gold" Jewels, Pvt Ltd' });
    await soldB2BOrder({ id: String(customer._id), name: customer.name });
    const res = await get("/b2b-customer-sales/export");
    expect(res.status).toBe(200);
    expect(res.text).toContain('"Mehta ""Gold"" Jewels, Pvt Ltd"');
  });
});
