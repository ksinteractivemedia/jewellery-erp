import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import type { B2BAccount, B2BCartQuote, B2BCatalogueResult, B2BInvoice, B2BOutstanding, B2BPayment, B2BPurchaseOrder, B2BQuotation, B2BSalesOrder } from "@jewellery/types";
import { PERMISSIONS } from "@jewellery/types";
import { PASSWORD, buildTestApp, createStaff, loginAs, seedChartOfAccounts, seedRbac, bearer } from "../../test/helpers";
import { type World, makeWorld, receive } from "../../test/inventory-fixtures";
import { AuditLogModel } from "../modules/audit/audit-log.model";
import { PermissionModel } from "../modules/auth/permission.model";
import { createRole } from "../modules/auth/role.repository";
import { createUser } from "../modules/auth/user.service";
import { createProductCategory } from "../modules/catalog/product-category.repository";
import { ProductModel } from "../modules/catalog/product.model";
import { createProductVariant } from "../modules/catalog/product-variant.repository";
import { createProduct } from "../modules/catalog/product.repository";
import { createTaxRule } from "../modules/compliance/tax-rule.repository";
import { createCustomerGroup } from "../modules/customers/customer-group.repository";
import { CustomerModel } from "../modules/customers/customer.model";
import { createCustomer } from "../modules/customers/customer.repository";
import { InventoryItemModel } from "../modules/inventory/inventory-item.model";
import { InventoryLedgerModel } from "../modules/inventory/inventory-ledger.model";
import { createMetalRate } from "../modules/metals/metal-rate.repository";
import { AllocationModel, B2BPaymentModel, InvoiceModel, PO_RULES, PurchaseOrderModel, QUOTATION_RULES, QuotationModel, SO_RULES, SalesOrderModel, PAYMENT_RULES, createMemoryDocumentStorage } from "../modules/b2b";
import { PURCHASE_ORDER_STATUSES, QUOTATION_STATUSES, SALES_ORDER_STATUSES, B2B_PAYMENT_STATUSES } from "@jewellery/types";
import { Types } from "mongoose";
import { createPriceList } from "../modules/pricing/price-list.repository";
import { PriceSnapshotModel } from "../modules/orders/price-snapshot.model";
import { createPricingRule } from "../modules/pricing/pricing-rule.repository";
import { StorefrontContentModel } from "../modules/storefront/storefront-content.model";
import { businessDay, addDays } from "../modules/dashboard/range";
import { AccountingEntryModel, ChartOfAccountModel } from "../modules/accounting";

let t: ReturnType<typeof buildTestApp>;
let w: World;
const PAST = new Date("2026-01-01");
const LIMIT = 100_000_000; // ₹10,00,000
// 22K, 10 g at ₹6,500/g, wastage 2%, making 8% of the metal value, GST 3% — checked against exact fractions:
// metal 6,500,000 + wastage 130,000 + making 520,000 = 7,150,000 taxable; GST 214,500; total 7,364,500 paise per band.
const BAND = { taxable: 7_150_000, gst: 214_500, total: 7_364_500 };
const rs = (rupees: number) => rupees * 100;
const addr = (state: string, city = "Mumbai") => ({ line1: "1 Zaveri Bazaar", city, state, postalCode: "400002", country: "India" });

let ctx: { customerId: string; groupId: string; priceListId: string; acmeBuyer: { email: string }; globexId: string; globexBuyer: { email: string }; salespersonId: string };
const tokens: Record<string, string> = {};

const buyer = (path: string, who = "acme") => request(t.app).get(`/api/portal${path}`).set(bearer(tokens[who]!));
const buyerPost = (path: string, body: object = {}, who = "acme") => request(t.app).post(`/api/portal${path}`).set(bearer(tokens[who]!)).send(body);
const buyerPut = (path: string, body: object, who = "acme") => request(t.app).put(`/api/portal${path}`).set(bearer(tokens[who]!)).send(body);
const staff = (path: string, who = "manager") => request(t.app).get(`/api/b2b${path}`).set(bearer(tokens[who]!));
const staffPost = (path: string, body: object = {}, who = "manager") => request(t.app).post(`/api/b2b${path}`).set(bearer(tokens[who]!)).send(body);
const staffPatch = (path: string, body: object, who = "manager") => request(t.app).patch(`/api/b2b${path}`).set(bearer(tokens[who]!)).send(body);

const skus = (rows: [string, number][]) => rows.map(([sku, quantity]) => ({ sku, quantity }));
async function submitPo(rows: [string, number][], over: Record<string, unknown> = {}, who = "acme") {
  const res = await buyerPost("/purchase-orders", { lines: skus(rows), shippingAddressIndex: 0, submit: true, ...over }, who);
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body.purchaseOrder as B2BPurchaseOrder;
}
/** Approve a submitted PO (fixing the agreed terms), then convert it into a sales order — where credit is enforced. */
async function approve(po: { id: string }, who = "manager") {
  const res = await staffPost(`/purchase-orders/${po.id}/approve`, {}, who);
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body.purchaseOrder as B2BPurchaseOrder;
}
async function convert(po: { id: string }, body: object = {}, who = "manager") {
  return staffPost(`/purchase-orders/${po.id}/convert`, body, who);
}
async function approved(rows: [string, number][], who = "manager") {
  const po = await submitPo(rows);
  await approve(po, who);
  const res = await convert(po, {}, who);
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return { po, order: res.body.order as B2BSalesOrder };
}
async function invoiced(rows: [string, number][] = [["BAND-1", 2]]) {
  const { po, order } = await approved(rows);
  expect((await staffPost(`/orders/${order.id}/allocate`)).status).toBe(200);
  const inv = await staffPost(`/orders/${order.id}/invoice`);
  expect(inv.status, JSON.stringify(inv.body)).toBe(201);
  return { po, order, invoice: inv.body.invoice as B2BInvoice };
}
let refN = 0;
const payRec = { method: "NEFT", receivedDate: businessDay(new Date()), bankName: "HDFC" };
async function recordedPayment(amount: number, by = "accountant", over: Record<string, unknown> = {}) {
  const res = await staffPost("/payments", { customerId: ctx.customerId, amount, reference: `UTR${++refN}`, ...payRec, ...over }, by);
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body.payment as B2BPayment;
}
async function verifiedPayment(amount: number) {
  const p = await recordedPayment(amount);
  const res = await staffPost(`/payments/${p.id}/verify`, {}, "admin");
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body.payment as B2BPayment;
}
const position = async () => ((await buyer("/account")).body.account as B2BAccount).position;
const soDoc = (id: string) => SalesOrderModel.findById(id);

async function customRole(name: string, keys: string[]) {
  const perms = await PermissionModel.find({ key: { $in: keys } });
  return createRole({ name, permissionIds: perms.map((p) => String(p._id)) });
}
async function tokenFor(email: string) {
  const { accessToken, res } = await loginAs(t.app, email);
  if (!accessToken) throw new Error(`sign-in failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  return accessToken;
}

let docs: ReturnType<typeof createMemoryDocumentStorage>;
beforeEach(async () => {
  docs = createMemoryDocumentStorage();
  t = buildTestApp(undefined, { documentStorage: docs });
  await seedRbac();
  await seedChartOfAccounts();
  w = await makeWorld();
  await createMetalRate({ metalId: w.gold, purity: "22K", ratePerGram: 650_000, effectiveFrom: PAST, source: "MANUAL" } as never);
  await createTaxRule({ name: "GST", hsnCode: "7113", intraState: { cgst: 1.5, sgst: 1.5 }, interState: { igst: 3 }, validFrom: PAST });
  await StorefrontContentModel.create({ key: "default", content: { brandName: "Suvarna", announcements: [], trust: [], policies: {}, featured: { collectionSlugs: [], productSlugs: [] }, pricing: { hsnCode: "7113" } } });
  // The default wholesale rule; tier rules are added by the tests that need them.
  await createPricingRule({ name: "B2B default", metalId: w.gold, customerType: "B2B", makingChargeType: "PERCENTAGE", makingChargeValue: 8, wastageType: "PERCENTAGE", wastageValue: 2, validFrom: PAST } as never);

  const rings = await createProductCategory({ name: "Rings" });
  const base = { b2bEnabled: true, isActive: true, images: [], categoryId: rings.id, metalId: w.gold, purity: "22K" };
  const band = await createProduct({ ...base, sku: "BAND-1", name: "Plain Band", defaultGrossWeight: 10, defaultNetWeight: 10, b2bMinOrderQuantity: 2, tags: ["band"] } as never);
  const ring = await createProduct({ ...base, sku: "RING-1", name: "Sized Ring", defaultGrossWeight: 4, defaultNetWeight: 4 } as never);
  const v12 = await createProductVariant({ productId: ring.id, sku: "RING-1-12", attributes: { Size: "12" }, defaultGrossWeight: 4 } as never);
  await createProductVariant({ productId: ring.id, sku: "RING-1-14", attributes: { Size: "14" }, defaultGrossWeight: 4 } as never);
  const por = await createProduct({ ...base, sku: "POR-1", name: "Quote Only Piece", defaultGrossWeight: 20, defaultNetWeight: 20, b2bPriceOnRequest: true } as never);
  const stone = await createProduct({ ...base, sku: "STN-1", name: "Stone Set Choker", defaultGrossWeight: 30, defaultNetWeight: 28, stoneDetails: [{ name: "Kundan", caratWeight: 5, quantity: 3 }] } as never);
  await createProduct({ ...base, sku: "HID-1", name: "Retail Only", b2bEnabled: false, defaultGrossWeight: 5, defaultNetWeight: 5 } as never);
  for (let i = 0; i < 12; i++) await receive(w, { productId: band.id, grossWeight: 10, cost: 100_00 });
  for (let i = 0; i < 2; i++) await receive(w, { productId: ring.id, variantId: v12.id, grossWeight: 4, cost: 100_00 });
  for (let i = 0; i < 3; i++) await receive(w, { productId: por.id, grossWeight: 20, cost: 100_00 });
  await receive(w, { productId: stone.id, grossWeight: 30, cost: 100_00 });

  const group = await createCustomerGroup({ name: "Distributors" });
  const priceList = await createPriceList({ code: "WS-GOLD", name: "Wholesale gold", channel: "B2B", effectiveFrom: PAST });
  const sp = await createStaff("SALES_MANAGER");
  const customer = await createCustomer({
    type: "B2B", name: "Acme Jewellers", email: "accounts@acme.test", gstin: "27ABCDE1234F1Z5", customerGroupId: group.id,
    billingAddress: addr("Maharashtra"), shippingAddresses: [addr("Maharashtra"), addr("Karnataka", "Bengaluru")],
    b2b: { contacts: [{ name: "Ravi Shah", email: "ravi@acme.test", phone: "9820000000", designation: "Purchase head", isPrimary: true }], creditLimit: LIMIT, paymentTermsDays: 30, priceListCode: "WS-GOLD", salespersonId: sp.user.id, territory: "West" },
  } as never);
  const globex = await createCustomer({ type: "B2B", name: "Globex Gems", email: "accounts@globex.test", billingAddress: addr("Gujarat", "Surat"), shippingAddresses: [addr("Gujarat", "Surat")], b2b: { creditLimit: rs(50_000), paymentTermsDays: 15 } } as never);
  const acmeBuyer = await createUser({ email: "buyer@acme.test", name: "Ravi Shah", password: PASSWORD, userType: "B2B_BUYER", customerId: customer.id } as never, 4);
  const globexBuyer = await createUser({ email: "buyer@globex.test", name: "Gita Rao", password: PASSWORD, userType: "B2B_BUYER", customerId: globex.id } as never, 4);
  void acmeBuyer; void globexBuyer;
  ctx = { customerId: customer.id, groupId: group.id, priceListId: priceList.id, acmeBuyer: { email: "buyer@acme.test" }, globexId: globex.id, globexBuyer: { email: "buyer@globex.test" }, salespersonId: sp.user.id };

  tokens.acme = await tokenFor("buyer@acme.test");
  tokens.globex = await tokenFor("buyer@globex.test");
  tokens.manager = await tokenFor((await createStaff("B2B_MANAGER")).email);
  tokens.accountant = await tokenFor((await createStaff("ACCOUNTANT")).email);
  tokens.admin = await tokenFor((await createStaff("ADMIN")).email);
  tokens.viewer = await tokenFor((await createStaff("VIEWER")).email);
  tokens.support = await tokenFor((await createStaff("CUSTOMER_SUPPORT")).email);
});

// =====================================================================================================
describe("who can reach what", () => {
  it("needs a login", async () => {
    expect((await request(t.app).get("/api/portal/account")).status).toBe(401);
    expect((await request(t.app).get("/api/b2b/customers")).status).toBe(401);
  });
  it("keeps staff out of the buyer's portal, and buyers out of the seller's API", async () => {
    expect((await buyer("/account", "manager")).status).toBe(403);
    expect((await buyer("/account", "admin")).status).toBe(403);
    expect((await staff("/customers", "acme")).status).toBe(403);
    expect((await staffPost("/payments", { customerId: ctx.customerId, amount: 100, ...payRec }, "acme")).status).toBe(403);
  });
  it("refuses a buyer login that isn't linked to a customer, or whose customer is inactive", async () => {
    await createUser({ email: "orphan@x.test", name: "Orphan", password: PASSWORD, userType: "B2B_BUYER" } as never, 4);
    expect((await buyer("/account", "acme")).status).toBe(200);
    const orphan = await tokenFor("orphan@x.test");
    expect((await request(t.app).get("/api/portal/account").set(bearer(orphan))).status).toBe(403);
    await CustomerModel.updateOne({ _id: ctx.customerId }, { isActive: false });
    expect((await buyer("/account")).status).toBe(403);
  });
  it("gives a buyer only their own documents — another customer's are simply not found", async () => {
    const po = await submitPo([["BAND-1", 2]]);
    expect((await buyer(`/purchase-orders/${po.id}`, "globex")).status).toBe(404);
    expect((await buyerPost(`/purchase-orders/${po.id}/cancel`, {}, "globex")).status).toBe(404);
    expect(((await buyer("/purchase-orders", "globex")).body.items as unknown[]).length).toBe(0);
    const { order, invoice } = await invoiced();
    expect((await buyer(`/orders/${order.id}`, "globex")).status).toBe(404);
    expect((await buyer(`/invoices/${invoice.id}`, "globex")).status).toBe(404);
  });
  it("protects the seller's actions by permission, not by role name", async () => {
    const po = await submitPo([["BAND-1", 2]]);
    for (const who of ["viewer", "support", "accountant"]) expect((await staffPost(`/purchase-orders/${po.id}/approve`, {}, who)).status, who).toBe(403);
    expect((await staffPost("/payments", { customerId: ctx.customerId, amount: 100, ...payRec }, "manager")).status).toBe(403); // no accounting.create_payment
    expect((await staff("/customers", "viewer")).status).toBe(200);
    expect((await staffPatch(`/customers/${ctx.customerId}/profile`, { creditLimit: 1 }, "viewer")).status).toBe(403);
  });
});

describe("the wholesale account", () => {
  it("shows the whole profile: company, GSTIN, contacts, addresses, terms, price list, group, salesperson, territory, credit", async () => {
    const a = (await buyer("/account")).body.account as B2BAccount;
    expect(a.customer).toMatchObject({ name: "Acme Jewellers", gstin: "27ABCDE1234F1Z5", email: "accounts@acme.test" });
    expect(a.profile.contacts[0]).toMatchObject({ name: "Ravi Shah", designation: "Purchase head", isPrimary: true });
    expect(a.billingAddress?.state).toBe("Maharashtra");
    expect(a.shippingAddresses.map((s) => s.state)).toEqual(["Maharashtra", "Karnataka"]);
    expect(a.profile).toMatchObject({ creditLimit: LIMIT, paymentTermsDays: 30, priceListCode: "WS-GOLD", territory: "West", creditHold: false });
    expect(a.priceList).toEqual({ code: "WS-GOLD", name: "Wholesale gold" });
    expect(a.groupName).toBe("Distributors");
    expect(a.salesperson?.name).toBe("Test SALES_MANAGER");
    expect(a.position).toEqual({ limit: LIMIT, outstanding: 0, committed: 0, available: LIMIT, overdue: 0, onHold: false, blockOnOverdue: false });
    expect(JSON.stringify(a)).not.toMatch(/salespersonId|creditSeq|passwordHash/);
  });
  it("lets an authorised seller change the terms, and puts the before and after on the audit log", async () => {
    const res = await staffPatch(`/customers/${ctx.customerId}/profile`, { creditLimit: rs(20_00_000), paymentTermsDays: 45, territory: "North" });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.account.profile).toMatchObject({ creditLimit: rs(20_00_000), paymentTermsDays: 45, territory: "North" });
    const log = (await AuditLogModel.findOne({ action: "b2b.profile_updated" }).lean())!;
    expect(log.metadata).toMatchObject({ before: { creditLimit: LIMIT, paymentTermsDays: 30 }, after: { creditLimit: rs(20_00_000), paymentTermsDays: 45 } });
  });
  it("refuses a malformed profile change", async () => {
    expect((await staffPatch(`/customers/${ctx.customerId}/profile`, { creditLimit: -5 })).status).toBe(400);
    expect((await staffPatch(`/customers/${ctx.customerId}/profile`, { gstin: "nope" })).status).toBe(400);
    expect((await staffPatch(`/customers/${ctx.customerId}/profile`, { outstanding: 0 })).status).toBe(400); // outstanding is derived, never set
  });
});

describe("wholesale pricing — the one engine, in the hierarchy's order", () => {
  const bandFor = async () => ((await buyer("/catalogue?q=BAND-1")).body as B2BCatalogueResult).items[0]!;
  it("prices at the default wholesale rule, ex-GST first, with GST and the total beside it", async () => {
    const item = await bandFor();
    expect(item.price).toMatchObject({ status: "AVAILABLE", unitTaxable: BAND.taxable, unitGst: BAND.gst, unitTotal: BAND.total, basis: "DEFAULT", basisName: "B2B default" });
  });
  it("applies a price-list rule, then a group rule over it, then a customer-specific rule over both", async () => {
    await createPricingRule({ name: "WS list", metalId: w.gold, priceListId: ctx.priceListId, makingChargeType: "PERCENTAGE", makingChargeValue: 5, validFrom: PAST } as never);
    expect((await bandFor()).price).toMatchObject({ basis: "PRICE_LIST", basisName: "WS list", unitTaxable: 6_500_000 + 130_000 + 325_000 });
    await createPricingRule({ name: "Distributors", metalId: w.gold, customerGroupId: ctx.groupId, makingChargeType: "PERCENTAGE", makingChargeValue: 6, validFrom: PAST } as never);
    expect((await bandFor()).price).toMatchObject({ basis: "CUSTOMER_GROUP", basisName: "Distributors", unitTaxable: 6_500_000 + 130_000 + 390_000 });
    await createPricingRule({ name: "Acme only", metalId: w.gold, customerId: ctx.customerId, makingChargeType: "PERCENTAGE", makingChargeValue: 4, validFrom: PAST } as never);
    expect((await bandFor()).price).toMatchObject({ basis: "CUSTOMER", basisName: "Acme only", unitTaxable: 6_500_000 + 130_000 + 260_000, unitGst: 206_700 });
  });
  it("never leaks one customer's special price to another", async () => {
    await createPricingRule({ name: "Acme only", metalId: w.gold, customerId: ctx.customerId, makingChargeType: "PERCENTAGE", makingChargeValue: 4, validFrom: PAST } as never);
    const globex = ((await buyer("/catalogue?q=BAND-1", "globex")).body as B2BCatalogueResult).items[0]!;
    expect(globex.price).toMatchObject({ basis: "DEFAULT", unitTaxable: BAND.taxable });
  });
  it("follows the metal rate — nothing is stored", async () => {
    await createMetalRate({ metalId: w.gold, purity: "22K", ratePerGram: 700_000, effectiveFrom: new Date(Date.now() - 1000), source: "MANUAL" } as never);
    expect((await bandFor()).price).toMatchObject({ status: "AVAILABLE", unitTaxable: 7_000_000 + 140_000 + 560_000 });
  });
  it("says price on request — with the reason — for a piece flagged that way, and for one that can't be priced honestly", async () => {
    const cat = (await buyer("/catalogue?pageSize=50")).body as B2BCatalogueResult;
    const por = cat.items.find((i) => i.sku === "POR-1")!;
    expect(por.price).toMatchObject({ status: "ON_REQUEST", reason: "POLICY" });
    const stone = cat.items.find((i) => i.sku === "STN-1")!;
    expect(stone.price).toMatchObject({ status: "ON_REQUEST", reason: "STONE_VALUE_MISSING" });
  });
});

describe("the wholesale catalogue", () => {
  const cat = async (qs = "") => (await buyer(`/catalogue?pageSize=50${qs}`)).body as B2BCatalogueResult;
  it("lists only what is offered to wholesale, by SKU, with exact stock, minimum order and weights", async () => {
    const r = await cat();
    expect(r.items.map((i) => i.sku).sort()).toEqual(["BAND-1", "POR-1", "RING-1-12", "RING-1-14", "STN-1"]);
    expect(r.items.find((i) => i.sku === "BAND-1")).toMatchObject({ name: "Plain Band", available: 12, minOrderQuantity: 2, purity: "22K", metal: "Gold", category: "Rings", grossWeight: 10, netWeight: 10 });
    expect(r.items.some((i) => i.sku === "HID-1")).toBe(false);
  });
  it("sells a sized design by size SKU, each with its own stock", async () => {
    const r = await cat();
    expect(r.items.find((i) => i.sku === "RING-1-12")).toMatchObject({ available: 2, variantLabel: "12" });
    expect(r.items.find((i) => i.sku === "RING-1-14")).toMatchObject({ available: 0 });
  });
  it("filters by text, category, metal, purity and availability, and sorts", async () => {
    expect((await cat("&q=band")).items.map((i) => i.sku)).toEqual(["BAND-1"]);
    expect((await cat("&category=rings")).total).toBe(5);
    expect((await cat("&metal=GOLD")).total).toBe(5);
    expect((await cat("&metal=SILVER")).total).toBe(0);
    expect((await cat("&purity=22K")).total).toBe(5);
    expect((await cat("&availability=out")).items.map((i) => i.sku)).toEqual(["RING-1-14"]);
    expect((await cat("&availability=in")).total).toBe(4);
    expect((await cat("&sort=stock")).items[0]!.sku).toBe("BAND-1");
    expect((await cat("&sort=price-desc")).items.at(-1)!.price.status).toBe("ON_REQUEST");
  });
  it("paginates and reports facets", async () => {
    const p = (await buyer("/catalogue?pageSize=2&page=2")).body as B2BCatalogueResult;
    expect(p).toMatchObject({ total: 5, page: 2, pageSize: 2 });
    expect(p.items).toHaveLength(2);
    expect(p.facets.categories[0]).toMatchObject({ name: "Rings", count: 5 });
    expect(p.facets.metals[0]).toMatchObject({ code: "GOLD" });
  });
  it("stops offering a piece the moment it is turned off for wholesale", async () => {
    await ProductModel.updateOne({ sku: "BAND-1" }, { $set: { b2bEnabled: false } });
    expect((await cat()).items.some((i) => i.sku === "BAND-1")).toBe(false);
  });
});

describe("quick order and cart — SKU and quantity, checked by the backend", () => {
  const quote = async (rows: [string, number][], extra: object = {}) => (await buyerPost("/quick-order/resolve", { rows: skus(rows), ...extra })).body as B2BCartQuote;
  it("prices SKUs (any capitalisation), merges repeated rows, and totals them", async () => {
    const q = await quote([["band-1", 2], ["BAND-1", 1]]);
    expect(q.lines).toHaveLength(1);
    expect(q.lines[0]).toMatchObject({ sku: "BAND-1", quantity: 3, lineTaxable: BAND.taxable * 3, lineGst: BAND.gst * 3, lineTotal: BAND.total * 3 });
    expect(q.totals).toEqual({ taxable: BAND.taxable * 3, gst: BAND.gst * 3, total: BAND.total * 3, complete: true });
    expect(q.canSubmit).toBe(true);
  });
  it("blocks what can't be ordered: an unknown SKU, a retail-only piece, a quantity under the minimum, a sized design's bare SKU", async () => {
    const q = await quote([["NOPE-9", 1], ["HID-1", 1], ["BAND-1", 1], ["RING-1", 1]]);
    const codes = (sku: string) => q.lines.find((l) => l.sku === sku)!.problems.map((p) => `${p.code}:${p.blocking}`);
    expect(codes("NOPE-9")).toEqual(["UNKNOWN_SKU:true"]);
    expect(codes("HID-1")).toContain("NOT_OFFERED:true");
    expect(codes("BAND-1")).toContain("BELOW_MOQ:true");
    expect(codes("RING-1")).toContain("NOT_OFFERED:true");
    expect(q.canSubmit).toBe(false);
  });
  it("warns, without blocking, about stock and price on request — wholesale may ask for more than is on the shelf", async () => {
    const q = await quote([["BAND-1", 20], ["POR-1", 1], ["RING-1-14", 1]]);
    expect(q.lines.find((l) => l.sku === "BAND-1")!.problems).toEqual([expect.objectContaining({ code: "INSUFFICIENT_STOCK", blocking: false })]);
    expect(q.lines.find((l) => l.sku === "POR-1")!.problems.map((p) => p.code)).toEqual(["PRICE_ON_REQUEST"]);
    expect(q.lines.find((l) => l.sku === "RING-1-14")!.problems.map((p) => p.code)).toContain("OUT_OF_STOCK");
    expect(q.canSubmit).toBe(true);
    expect(q.totals.complete).toBe(false); // the price-on-request line isn't in the total
  });
  it("refuses a price, discount or total from the browser", async () => {
    for (const extra of [{ unitPrice: 1 }, { price: 1 }, { discount: 50 }, { total: 1 }]) {
      for (const body of [{ rows: [{ sku: "BAND-1", quantity: 2, ...extra }] }, { rows: skus([["BAND-1", 2]]), ...extra }]) {
        const res = await buyerPost("/cart/quote", body);
        expect(res.status, `${JSON.stringify(body)} → ${JSON.stringify(res.body)} ${JSON.stringify(res.headers)}`).toBe(400);
      }
    }
  });
  it("prices GST for the chosen shipping address: intra-state at Maharashtra, the total unchanged for Karnataka", async () => {
    const a = await quote([["BAND-1", 2]], { shippingAddressIndex: 0 });
    const b = await quote([["BAND-1", 2]], { shippingAddressIndex: 1 });
    expect(b.totals.total).toBe(a.totals.total);
    expect((await buyerPost("/cart/quote", { rows: skus([["BAND-1", 2]]), shippingAddressIndex: 9 })).status).toBe(400);
  });
  it("shows the credit position beside the cart, with an actionable warning when it would be exceeded", async () => {
    const fine = await quote([["BAND-1", 2]]);
    expect(fine.credit).toMatchObject({ requiresApproval: false, reasons: [], orderAmount: BAND.total * 2 });
    const big = await quote([["BAND-1", 14]]);
    expect(big.credit.requiresApproval).toBe(true);
    expect(big.credit.wouldExceedBy).toBe(BAND.total * 14 - LIMIT);
    expect(big.credit.reasons[0]).toMatchObject({ code: "CREDIT_LIMIT_EXCEEDED" });
    expect(big.credit.reasons[0]!.action).toMatch(/reduce the order|limit increase/i);
  });
});

describe("purchase orders", () => {
  it("saves a draft, edits it, and submits it — re-priced at submission", async () => {
    const draft = await buyerPost("/purchase-orders", { lines: skus([["BAND-1", 2]]), shippingAddressIndex: 0, submit: false, customerPoRef: "ACME/26/114", notes: "Festive stock" });
    expect(draft.status).toBe(201);
    const po = draft.body.purchaseOrder as B2BPurchaseOrder;
    expect(po).toMatchObject({ status: "DRAFT", customerPoRef: "ACME/26/114", notes: "Festive stock", totals: { total: BAND.total * 2, complete: true } });
    expect(po.poNo).toMatch(/^BPO-\d{6}$/);
    const edited = await buyerPut(`/purchase-orders/${po.id}`, { lines: skus([["BAND-1", 4]]), shippingAddressIndex: 1, submit: false });
    expect(edited.body.purchaseOrder).toMatchObject({ status: "DRAFT", totals: { total: BAND.total * 4 }, shippingAddress: { state: "Karnataka" } });
    // the gold rate moves before they submit
    await createMetalRate({ metalId: w.gold, purity: "22K", ratePerGram: 700_000, effectiveFrom: new Date(Date.now() - 1000), source: "MANUAL" } as never);
    const sub = await buyerPost(`/purchase-orders/${po.id}/submit`);
    expect(sub.body.purchaseOrder.status).toBe("SUBMITTED");
    expect(sub.body.purchaseOrder.totals.taxable).toBe((7_000_000 + 140_000 + 560_000) * 4);
    expect(sub.body.purchaseOrder.history.map((h: { status: string }) => h.status)).toEqual(["DRAFT", "SUBMITTED"]);
  });
  it("enforces the minimum order quantity and the offered range on the BACKEND, whatever the browser did", async () => {
    for (const rows of [[["BAND-1", 1]], [["HID-1", 5]], [["NOPE", 1]]] as [string, number][][]) {
      const res = await buyerPost("/purchase-orders", { lines: skus(rows), shippingAddressIndex: 0, submit: true });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("ORDER_BLOCKED");
    }
    expect(await PurchaseOrderModel.countDocuments()).toBe(0);
  });
  it("accepts an order for more than is in stock, and one containing a price-on-request line (the seller will quote it)", async () => {
    const po = await submitPo([["BAND-1", 30], ["POR-1", 1]]);
    expect(po.status).toBe("SUBMITTED");
    expect(po.totals.complete).toBe(false);
    expect(po.lines.find((l) => l.sku === "POR-1")).toMatchObject({ priceOnRequest: true, lineTotal: 0 });
  });
  it("carries the credit warning the customer was shown", async () => {
    const po = await submitPo([["BAND-1", 14]]);
    expect(po.credit).toMatchObject({ requiresApproval: true, wouldExceedBy: BAND.total * 14 - LIMIT });
  });
  it("lets the customer cancel until it is approved, and no later", async () => {
    const po = await submitPo([["BAND-1", 2]]);
    expect((await buyerPost(`/purchase-orders/${po.id}/cancel`, { reason: "ordered twice" })).body.purchaseOrder.status).toBe("CANCELLED");
    expect((await buyerPost(`/purchase-orders/${po.id}/cancel`)).status).toBe(409);
    const { po: approvedPo } = await approved([["BAND-1", 2]]);
    expect((await buyerPost(`/purchase-orders/${approvedPo.id}/cancel`)).status).toBe(409);
  });
  it("only edits drafts", async () => {
    const po = await submitPo([["BAND-1", 2]]);
    expect((await buyerPut(`/purchase-orders/${po.id}`, { lines: skus([["BAND-1", 3]]), shippingAddressIndex: 0, submit: false })).status).toBe(409);
    expect((await buyerPost(`/purchase-orders/${po.id}/submit`)).status).toBe(409);
  });
  it("refuses a price or total in the body", async () => {
    for (const extra of [{ total: 1 }, { discount: 10 }, { lines: [{ sku: "BAND-1", quantity: 2, unitPrice: 1 }] }]) {
      expect((await buyerPost("/purchase-orders", { lines: skus([["BAND-1", 2]]), shippingAddressIndex: 0, submit: true, ...extra })).status).toBe(400);
    }
  });
});

describe("seller review, approval and the sales order", () => {
  it("takes a submitted PO into review, then approves it at the customer's price into a sales order with a frozen price", async () => {
    const po = await submitPo([["BAND-1", 3]]);
    const rev = await staffPost(`/purchase-orders/${po.id}/review`);
    expect(rev.status, JSON.stringify(rev.body)).toBe(200);
    expect(rev.body.purchaseOrder.status).toBe("UNDER_REVIEW");
    const approvedPo = await approve(po);
    expect(approvedPo).toMatchObject({ status: "APPROVED", approved: { via: "DIRECT", totals: { taxable: BAND.taxable * 3, gst: BAND.gst * 3, total: BAND.total * 3 } } });
    expect(approvedPo.salesOrderId).toBeUndefined(); // approving fixes the terms; it does not yet commit stock or credit
    const res = await convert(po);
    expect(res.status).toBe(201);
    const so = res.body.order as B2BSalesOrder;
    expect(so).toMatchObject({ status: "CONFIRMED", poNo: po.poNo, totals: { taxable: BAND.taxable * 3, gst: BAND.gst * 3, total: BAND.total * 3 } });
    expect(so.soNo).toMatch(/^SO-\d{6}$/);
    expect(so.credit.check.requiresApproval).toBe(false);
    expect(so.billingAddress.state).toBe("Maharashtra");
    const after = (await buyer(`/purchase-orders/${po.id}`)).body.purchaseOrder as B2BPurchaseOrder;
    expect(after).toMatchObject({ status: "CONVERTED", salesOrderId: so.id });
    // the price is frozen: a later rate move does not touch the order
    await createMetalRate({ metalId: w.gold, purity: "22K", ratePerGram: 900_000, effectiveFrom: new Date(Date.now() - 500), source: "MANUAL" } as never);
    expect(((await buyer(`/orders/${so.id}`)).body.order as B2BSalesOrder).totals.total).toBe(BAND.total * 3);
    const snap = (await PriceSnapshotModel.findById(so.lines[0]!.priceSnapshotId).lean())!;
    expect(snap).toMatchObject({ documentType: "B2B_APPROVAL", unitTotal: BAND.total });
    expect((snap.inputs as { channel: string; customerType: string; customerId: string })).toMatchObject({ channel: "B2B", customerType: "B2B", customerId: ctx.customerId });
  });
  it("freezes the sales order and its snapshot: lines, prices and totals can't be edited", async () => {
    const { order } = await approved([["BAND-1", 2]]);
    await expect(SalesOrderModel.updateOne({ _id: order.id }, { $set: { "totals.total": 1 } })).rejects.toThrow(/Sales order/);
    await expect(SalesOrderModel.updateOne({ _id: order.id }, { $set: { "lines.0.unitTotal": 1 } })).rejects.toThrow(/Sales order/);
    await expect(PriceSnapshotModel.updateOne({ _id: order.lines[0]!.priceSnapshotId }, { $set: { unitTotal: 1 } })).rejects.toThrow(/append-only/);
  });
  it("won't approve a PO with a price-on-request line directly — that needs a quotation", async () => {
    const po = await submitPo([["BAND-1", 2], ["POR-1", 1]]);
    const res = await staffPost(`/purchase-orders/${po.id}/approve`);
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/POR-1.*quotation/);
  });
  it("won't approve a PO twice, or one that isn't submitted", async () => {
    const po = await submitPo([["BAND-1", 2]]);
    await staffPost(`/purchase-orders/${po.id}/approve`);
    expect((await staffPost(`/purchase-orders/${po.id}/approve`)).status).toBe(409);
    const draft = (await buyerPost("/purchase-orders", { lines: skus([["BAND-1", 2]]), shippingAddressIndex: 0, submit: false })).body.purchaseOrder;
    expect((await staffPost(`/purchase-orders/${draft.id}/approve`)).status).toBe(409);
  });
  it("rejects a PO with a reason the customer can read", async () => {
    const po = await submitPo([["BAND-1", 2]]);
    const res = await staffPost(`/purchase-orders/${po.id}/reject`, { reason: "Out of our range this season" });
    expect(res.body.purchaseOrder.status).toBe("REJECTED");
    expect(JSON.stringify((await buyer(`/purchase-orders/${po.id}`)).body)).toContain("Out of our range this season");
  });
  it("lists the seller's queue across customers, filterable", async () => {
    await submitPo([["BAND-1", 2]]);
    await submitPo([["BAND-1", 2]], {}, "globex");
    const all = (await staff("/purchase-orders?status=SUBMITTED")).body.items as B2BPurchaseOrder[];
    expect(all.map((p) => p.customer.name).sort()).toEqual(["Acme Jewellers", "Globex Gems"]);
    expect(((await staff(`/purchase-orders?customerId=${ctx.globexId}`)).body.items as B2BPurchaseOrder[]).map((p) => p.customer.name)).toEqual(["Globex Gems"]);
  });
});

describe("quotation and negotiation", () => {
  const quoteFor = async (po: B2BPurchaseOrder, body: object = {}) => {
    const res = await staffPost(`/purchase-orders/${po.id}/quote`, body);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    return res.body.quotation as B2BQuotation;
  };
  it("quotes with a percentage concession and a target price, each frozen with the engine's own arithmetic", async () => {
    const po = await submitPo([["BAND-1", 4], ["RING-1-12", 2]]);
    const q = await quoteFor(po, { lines: [{ sku: "BAND-1", discountPercent: 5, note: "Volume" }, { sku: "RING-1-12", unitTaxable: 2_500_000, note: "Matches a competing quote" }], validDays: 10, terms: "Delivery in 5 days", message: "Best price we can do" });
    expect(q).toMatchObject({ version: 1, status: "QUOTED", poNo: po.poNo, terms: "Delivery in 5 days" });
    expect(q.quoteNo).toMatch(/^QT-\d{6}$/);
    const band = q.lines.find((l) => l.sku === "BAND-1")!;
    expect(band.concession).toEqual({ kind: "PERCENT", value: 5, note: "Volume", listUnitTaxable: 7_150_000 });
    expect(band.unitTaxable).toBe(7_150_000 - 357_500); // 5% of the 7,150,000 subtotal, and GST on what remains
    expect(band.unitGst).toBe(203_776); // CGST and SGST each round 1.5% of 6,792,500 (101,887.5) half away from zero: the engine rounds per component
    expect(q.lines.find((l) => l.sku === "RING-1-12")).toMatchObject({ unitTaxable: 2_500_000, concession: { kind: "TARGET_PRICE", value: 2_500_000 } });
    expect(q.totals.total).toBe(q.lines.reduce((s, l) => s + l.lineTotal, 0));
    expect(new Date(q.validUntil).getTime()).toBeGreaterThan(Date.now() + 9 * 86_400_000);
    expect(q.messages[0]).toMatchObject({ by: "SELLER", text: "Best price we can do" });
    const snap = (await PriceSnapshotModel.findById(band.priceSnapshotId).lean())!;
    expect(snap.documentType).toBe("B2B_QUOTATION");
    expect((snap.breakdown as { rules: { discount: { source: { kind: string } } } }).rules.discount.source.kind).toBe("OVERRIDE"); // a hand-entered concession, recorded as such
    expect((await buyer(`/purchase-orders/${po.id}`)).body.purchaseOrder).toMatchObject({ status: "QUOTED", quotationId: q.id });
  });
  it("quotes a price-on-request line (by policy) — and refuses one the engine can't price at all", async () => {
    const po = await submitPo([["POR-1", 1]]);
    const q = await quoteFor(po);
    expect(q.lines[0]!.unitTotal).toBeGreaterThan(0);
    const bad = await submitPo([["STN-1", 1]]);
    const res = await staffPost(`/purchase-orders/${bad.id}/quote`, {});
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/STN-1.*no price data/);
  });
  it("refuses a target price above the standard price, a concession for a SKU not on the PO, and both kinds of concession at once", async () => {
    const po = await submitPo([["BAND-1", 2]]);
    expect((await staffPost(`/purchase-orders/${po.id}/quote`, { lines: [{ sku: "BAND-1", unitTaxable: 9_000_000, note: "above list" }] })).status).toBe(400);
    expect((await staffPost(`/purchase-orders/${po.id}/quote`, { lines: [{ sku: "RING-1-12", discountPercent: 5, note: "not on the PO" }] })).status).toBe(400);
    expect((await staffPost(`/purchase-orders/${po.id}/quote`, { lines: [{ sku: "BAND-1", discountPercent: 5, unitTaxable: 6_000_000, note: "both at once" }] })).status).toBe(400);
  });
  it("shows the customer the quotation, and lets them accept it — creating the sales order at the QUOTED price, whatever the rate does", async () => {
    const po = await submitPo([["BAND-1", 4]]);
    const q = await quoteFor(po, { lines: [{ sku: "BAND-1", discountPercent: 10, note: "Volume order" }] });
    expect(((await buyer("/quotations")).body.items as B2BQuotation[]).map((x) => x.quoteNo)).toEqual([q.quoteNo]);
    await createMetalRate({ metalId: w.gold, purity: "22K", ratePerGram: 900_000, effectiveFrom: new Date(Date.now() - 500), source: "MANUAL" } as never);
    const res = await buyerPost(`/quotations/${q.id}/accept`);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    // Accepting APPROVES the PO at the quoted prices; the seller then converts it into a sales order.
    expect(res.body.purchaseOrder).toMatchObject({ status: "APPROVED", approved: { via: "QUOTATION", totals: { total: q.totals.total } } });
    expect((await buyer(`/quotations/${q.id}`)).body.quotation.status).toBe("APPROVED");
    const conv = await convert(po);
    expect(conv.status, JSON.stringify(conv.body)).toBe(201);
    const so = conv.body.order as B2BSalesOrder;
    expect(so.totals.total).toBe(q.totals.total);
    expect(so.quotationId).toBe(q.id);
    expect(so.lines[0]!.priceSnapshotId).toBe(q.lines[0]!.priceSnapshotId);
    expect((await buyer(`/quotations/${q.id}`)).body.quotation.status).toBe("CONVERTED");
    expect((await buyer(`/purchase-orders/${po.id}`)).body.purchaseOrder.status).toBe("CONVERTED");
    expect((await buyerPost(`/quotations/${q.id}/accept`)).status).toBe(409);
  });
  it("refuses to accept an expired quotation, and reports it as EXPIRED", async () => {
    const po = await submitPo([["BAND-1", 2]]);
    const q = await quoteFor(po);
    await QuotationModel.collection.updateOne({ quoteNo: q.quoteNo }, { $set: { validUntil: new Date(Date.now() - 1000) } });
    expect((await buyer(`/quotations/${q.id}`)).body.quotation.status).toBe("EXPIRED");
    const res = await buyerPost(`/quotations/${q.id}/accept`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("QUOTE_EXPIRED");
    expect(await SalesOrderModel.countDocuments()).toBe(0);
    expect((await buyer(`/purchase-orders/${po.id}`)).body.purchaseOrder.status).toBe("EXPIRED"); // and the PO waiting on it
  });
  it("negotiates: the customer counters, the seller revises, only the latest version can be accepted", async () => {
    const po = await submitPo([["BAND-1", 4]]);
    const v1 = await quoteFor(po, { lines: [{ sku: "BAND-1", discountPercent: 2, note: "First offer" }] });
    const counter = await buyerPost(`/quotations/${v1.id}/counter`, { message: "Can you do ₹70,000 a piece?", requestedPrices: [{ sku: "BAND-1", unitTaxable: 7_000_000 }] });
    expect(counter.body.quotation).toMatchObject({ status: "NEGOTIATION" });
    expect(counter.body.quotation.messages.at(-1)).toMatchObject({ by: "CUSTOMER", requestedPrices: [{ sku: "BAND-1", unitTaxable: 7_000_000 }] });
    expect((await buyer(`/purchase-orders/${po.id}`)).body.purchaseOrder.status).toBe("NEGOTIATION");
    expect((await buyerPost(`/quotations/${v1.id}/accept`)).status).toBe(409); // not while it is being renegotiated

    const v2 = await quoteFor(po, { lines: [{ sku: "BAND-1", unitTaxable: 7_000_000, note: "Agreed after the counter-offer" }], message: "Agreed" });
    expect(v2).toMatchObject({ version: 2, status: "QUOTED" });
    expect((await buyer(`/quotations/${v1.id}`)).body.quotation.status).toBe("SUPERSEDED");
    expect((await buyer(`/purchase-orders/${po.id}`)).body.purchaseOrder).toMatchObject({ status: "QUOTED", quotationId: v2.id });
    expect((await buyerPost(`/quotations/${v1.id}/accept`)).status).toBe(409);
    expect((await buyerPost(`/quotations/${v2.id}/accept`)).status).toBe(200);
    const so = (await convert(po)).body.order as B2BSalesOrder;
    expect(so.lines[0]!.unitTaxable).toBe(7_000_000);
    expect(so.history.map((h) => h.status)).toEqual(["CONFIRMED"]);
  });
  it("lets the customer decline, which ends the PO; and a rejected PO withdraws its open quotation", async () => {
    const po = await submitPo([["BAND-1", 2]]);
    const q = await quoteFor(po);
    expect((await buyerPost(`/quotations/${q.id}/decline`, { reason: "Too dear" })).body.quotation.status).toBe("REJECTED");
    expect((await buyer(`/purchase-orders/${po.id}`)).body.purchaseOrder.status).toBe("REJECTED"); // declining the quotation ends the PO
    const po2 = await submitPo([["BAND-1", 2]]);
    const q2 = await quoteFor(po2);
    await staffPost(`/purchase-orders/${po2.id}/reject`, { reason: "Changed our mind" });
    expect((await buyer(`/quotations/${q2.id}`)).body.quotation.status).toBe("REJECTED");
  });
  it("freezes an issued quotation", async () => {
    const q = await quoteFor(await submitPo([["BAND-1", 2]]));
    await expect(QuotationModel.updateOne({ _id: q.id }, { $set: { "totals.total": 1 } })).rejects.toThrow(/Quotation/);
  });
});

describe("credit — enforced by the backend, not the screen", () => {
  it("holds an order that would exceed the limit: it is created, but blocked from stock and invoicing until credit is approved", async () => {
    const { order } = await approved([["BAND-1", 14]]);
    expect(order.status).toBe("DRAFT");
    expect(order.credit.check).toMatchObject({ requiresApproval: true, wouldExceedBy: BAND.total * 14 - LIMIT });
    expect(order.credit.check.reasons[0]!.code).toBe("CREDIT_LIMIT_EXCEEDED");
    expect((await staffPost(`/orders/${order.id}/allocate`)).status).toBe(409);
    expect((await staffPost(`/orders/${order.id}/invoice`)).status).toBe(409);
    expect(await InventoryItemModel.countDocuments({ status: "RESERVED" })).toBe(0);
    expect((await position()).committed).toBe(0); // a held order isn't a commitment yet
  });
  it("lets only someone with the credit-override permission approve it, with a reason on the record and in the audit log", async () => {
    const approverOnly = await customRole("APPROVER_ONLY", [PERMISSIONS.B2B_VIEW, PERMISSIONS.B2B_APPROVE_PO]);
    const u = await createUser({ email: "approver@x.test", name: "Approver", password: PASSWORD, userType: "STAFF", roleIds: [approverOnly.id] } as never, 4);
    void u;
    tokens.approver = await tokenFor("approver@x.test");
    const { order } = await approved([["BAND-1", 14]]);

    const denied = await staffPost(`/orders/${order.id}/approve-credit`, { reason: "Long-standing customer, paying on time" }, "approver");
    expect(denied.status).toBe(409);
    expect(denied.body.error.code).toBe("CREDIT_BLOCKED");
    expect(denied.body.error.details.check.reasons[0].action).toMatch(/reduce the order|limit increase/i);
    expect((await soDoc(order.id))!.status).toBe("DRAFT");

    expect((await staffPost(`/orders/${order.id}/approve-credit`, { reason: "short" })).status).toBe(400); // a real reason is required
    const ok = await staffPost(`/orders/${order.id}/approve-credit`, { reason: "Long-standing customer, paying on time" });
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    expect(ok.body.order).toMatchObject({ status: "CONFIRMED", credit: { override: { reason: "Long-standing customer, paying on time", byName: "Test B2B_MANAGER" } } });
    const log = (await AuditLogModel.findOne({ action: "b2b.credit_overridden" }).lean())!;
    expect(log.metadata).toMatchObject({ reason: "Long-standing customer, paying on time", limit: LIMIT, reasons: ["CREDIT_LIMIT_EXCEEDED"] });
    expect(log.actorEmail).toBeTruthy();
    expect((await position()).committed).toBe(BAND.total * 14);
  });
  it("refuses a credit override on approval from someone without the permission (a 403, not a silent normal approval)", async () => {
    const approverOnly = await customRole("APPROVER_ONLY", [PERMISSIONS.B2B_VIEW, PERMISSIONS.B2B_APPROVE_PO]);
    await createUser({ email: "approver@x.test", name: "Approver", password: PASSWORD, userType: "STAFF", roleIds: [approverOnly.id] } as never, 4);
    tokens.approver = await tokenFor("approver@x.test");
    const po = await submitPo([["BAND-1", 14]]);
    await approve(po, "approver");
    const res = await convert(po, { creditOverride: { reason: "I say so, thanks" } }, "approver");
    expect(res.status).toBe(403);
    expect((await PurchaseOrderModel.findById(po.id))!.status).toBe("APPROVED"); // nothing was converted
    const held = await convert(po, {}, "approver"); // without an override it simply lands on hold
    expect(held.body.order.status).toBe("DRAFT");
  });
  it("approves over the limit in one step for someone entitled, recording the override", async () => {
    const po = await submitPo([["BAND-1", 14]]);
    await approve(po);
    const res = await convert(po, { creditOverride: { reason: "Approved by the owner" } });
    expect(res.body.order).toMatchObject({ status: "CONFIRMED", credit: { override: { reason: "Approved by the owner" } } });
    expect(await AuditLogModel.countDocuments({ action: "b2b.credit_overridden" })).toBe(1);
  });
  it("counts approved orders that aren't invoiced yet, so ten approvals can't each look fine alone", async () => {
    const a = await approved([["BAND-1", 6]]);
    const b = await approved([["BAND-1", 6]]);
    expect(a.order.status).toBe("CONFIRMED");
    expect(b.order.status).toBe("CONFIRMED");
    expect(await position()).toMatchObject({ committed: BAND.total * 12, available: LIMIT - BAND.total * 12 });
    const c = await approved([["BAND-1", 2]]);
    expect(c.order.status).toBe("DRAFT");
    expect(c.order.credit.check).toMatchObject({ exposureAfter: BAND.total * 14, wouldExceedBy: BAND.total * 14 - LIMIT });
  });
  it("serialises two approvals racing for the same headroom — exactly one gets it", async () => {
    const a = await submitPo([["BAND-1", 8]]);
    const b = await submitPo([["BAND-1", 8]]);
    await approve(a);
    await approve(b);
    const [ra, rb] = await Promise.all([convert(a), convert(b)]);
    expect([ra.status, rb.status]).toEqual([201, 201]);
    const statuses = [ra.body.order.status, rb.body.order.status].sort();
    expect(statuses).toEqual(["CONFIRMED", "DRAFT"]);
  });
  it("blocks on a credit hold whatever the headroom, and says so", async () => {
    await staffPatch(`/customers/${ctx.customerId}/profile`, { creditHold: true });
    const { order } = await approved([["BAND-1", 2]]);
    expect(order.status).toBe("DRAFT");
    expect(order.credit.check.reasons.map((r) => r.code)).toEqual(["ACCOUNT_ON_HOLD"]);
    expect((await buyer("/account")).body.account.position.onHold).toBe(true);
  });
  it("blocks on overdue invoices only when the account is set to", async () => {
    const { invoice } = await invoiced([["BAND-1", 2]]);
    await InvoiceModel.collection.updateOne({ invoiceNo: invoice.invoiceNo }, { $set: { dueDate: addDays(businessDay(new Date()), -10) } });
    expect((await approved([["BAND-1", 2]])).order.status).toBe("CONFIRMED");
    await staffPatch(`/customers/${ctx.customerId}/profile`, { blockOnOverdue: true });
    const held = await approved([["BAND-1", 2]]);
    expect(held.order.status).toBe("DRAFT");
    expect(held.order.credit.check.reasons.map((r) => r.code)).toEqual(["OVERDUE_INVOICES"]);
  });
  it("releases a held order without any override once the customer's payment brings them back within terms", async () => {
    const first = await invoiced([["BAND-1", 6]]); // 44,187,000 outstanding
    const second = await approved([["BAND-1", 6]]); // 88,374,000 in total: within the limit
    const third = await approved([["BAND-1", 4]]); // would take exposure to 117.8M — held
    expect(third.order.status).toBe("DRAFT");
    // The customer pays the first invoice in full: verified by a second person, then applied.
    const pay = await verifiedPayment(first.invoice.totals.total);
    expect((await staffPost(`/payments/${pay.id}/allocate`, { allocations: [{ invoiceId: first.invoice.id, amount: first.invoice.totals.total }] }, "accountant")).status).toBe(200);
    // A manager WITHOUT the override permission can now approve it, because no override is needed.
    const approverOnly = await customRole("APPROVER_ONLY", [PERMISSIONS.B2B_VIEW, PERMISSIONS.B2B_APPROVE_PO]);
    await createUser({ email: "approver@x.test", name: "Approver", password: PASSWORD, userType: "STAFF", roleIds: [approverOnly.id] } as never, 4);
    tokens.approver = await tokenFor("approver@x.test");
    const res = await staffPost(`/orders/${third.order.id}/approve-credit`, { reason: "Customer has paid down the account" }, "approver");
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.order.status).toBe("CONFIRMED");
    expect(res.body.order.credit.override).toBeUndefined();
    void second;
  });
  it("shows the customer the same position — limit, outstanding, available, overdue — computed from invoices", async () => {
    const { invoice } = await invoiced([["BAND-1", 2]]);
    await InvoiceModel.collection.updateOne({ invoiceNo: invoice.invoiceNo }, { $set: { dueDate: addDays(businessDay(new Date()), -3) } });
    const out = (await buyer("/outstanding")).body as B2BOutstanding;
    expect(out.position).toEqual({ limit: LIMIT, outstanding: BAND.total * 2, committed: 0, available: LIMIT - BAND.total * 2, overdue: BAND.total * 2, onHold: false, blockOnOverdue: false });
    expect(out.ageing).toEqual({ current: 0, days1to30: BAND.total * 2, days31to60: 0, days61to90: 0, over90: 0 });
    expect(out.invoices[0]).toMatchObject({ status: "OVERDUE", daysOverdue: 3, balance: BAND.total * 2 });
    const dash = (await buyer("/dashboard")).body;
    expect(dash.counts).toMatchObject({ unpaidInvoices: 1, overdueInvoices: 1 });
    expect(dash.actions.some((a: { kind: string }) => a.kind === "OVERDUE")).toBe(true);
  });
});

describe("allocation and invoicing", () => {
  it("allocates specific pieces to the order in the ledger, and only when the whole order can be filled", async () => {
    const { order } = await approved([["BAND-1", 3], ["RING-1-12", 2]]);
    const res = await staffPost(`/orders/${order.id}/allocate`);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.order.status).toBe("ALLOCATED");
    const held = await InventoryItemModel.find({ status: "RESERVED" });
    expect(held).toHaveLength(5);
    for (const i of held) expect(String(i.reservation!.referenceId)).toBe(order.id);
    expect(await InventoryLedgerModel.countDocuments({ movementType: "RESERVATION" })).toBe(5 + 0);
    expect((await staffPost(`/orders/${order.id}/allocate`)).status).toBe(409); // not twice
  });
  it("allocates what stock allows and reports the rest line by line: the order is PARTIALLY_ALLOCATED, not refused", async () => {
    const { order } = await approved([["BAND-1", 3], ["RING-1-14", 1]]); // no size 14 in stock
    const res = await staffPost(`/orders/${order.id}/allocate`);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.order).toMatchObject({ status: "PARTIALLY_ALLOCATED", shortfall: [{ sku: "RING-1-14", wanted: 1, available: 0 }] });
    expect(res.body.order.progress).toEqual([{ sku: "BAND-1", quantity: 3, allocated: 3, invoiced: 0 }, { sku: "RING-1-14", quantity: 1, allocated: 0, invoiced: 0 }]);
    expect(await InventoryItemModel.countDocuments({ status: "RESERVED" })).toBe(3);
  });
  it("refuses with a line-by-line shortfall only when NOTHING can be allocated, and lets the order wait", async () => {
    const { order } = await approved([["RING-1-14", 1]]);
    const res = await staffPost(`/orders/${order.id}/allocate`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("STOCK_SHORT");
    expect(res.body.error.details.shortfall).toEqual([{ sku: "RING-1-14", name: "Sized Ring", wanted: 1, available: 0 }]);
    expect(((await staff(`/orders/${order.id}`)).body.order as B2BSalesOrder)).toMatchObject({ status: "CONFIRMED", shortfall: [{ sku: "RING-1-14" }] });
  });
  it("gives the last pieces to exactly one of two orders allocated at the same moment", async () => {
    const a = await approved([["POR-1", 2]]).catch(() => null);
    void a;
    const x = await approved([["RING-1-12", 2]]);
    const y = await approved([["RING-1-12", 2]]);
    const [rx, ry] = await Promise.all([staffPost(`/orders/${x.order.id}/allocate`), staffPost(`/orders/${y.order.id}/allocate`)]);
    expect([rx.status, ry.status].sort()).toEqual([200, 409]);
    expect(await InventoryItemModel.countDocuments({ status: "RESERVED", productId: (await ProductModel.findOne({ sku: "RING-1" }))!._id })).toBe(2);
  });
  it("invoices an allocated order: pieces sold in the ledger, the invoice issued, due date from the payment terms — in one step", async () => {
    const { order, invoice } = await invoiced([["BAND-1", 3]]);
    expect(invoice).toMatchObject({ soNo: order.soNo, status: "UNPAID", paid: 0, balance: BAND.total * 3, totals: { taxable: BAND.taxable * 3, gst: BAND.gst * 3, total: BAND.total * 3 }, customer: { name: "Acme Jewellers", gstin: "27ABCDE1234F1Z5" } });
    expect(invoice.invoiceNo).toMatch(/^INV-\d{6}$/);
    expect(invoice.dueDate).toBe(addDays(invoice.issueDate, 30));
    expect(invoice.taxes).toEqual({ supplyType: "INTRA_STATE", cgst: BAND.gst * 3 / 2, sgst: BAND.gst * 3 / 2, igst: 0 });
    expect(await InventoryItemModel.countDocuments({ status: "SOLD" })).toBe(3);
    expect(await InventoryLedgerModel.countDocuments({ movementType: "SALE" })).toBe(3);
    expect((await staff(`/orders/${order.id}`)).body.order).toMatchObject({ status: "FULFILLED", invoices: [{ id: invoice.id, invoiceNo: invoice.invoiceNo, total: invoice.totals.total }], progress: [{ sku: "BAND-1", quantity: 3, allocated: 0, invoiced: 3 }] });
    expect(invoice.billingAddress.state).toBe("Maharashtra");
    expect((await staffPost(`/orders/${order.id}/invoice`)).status).toBe(409);
  });
  it("splits GST as IGST for goods shipped out of state — the same total", async () => {
    const po = await submitPo([["BAND-1", 2]], { shippingAddressIndex: 1 });
    await approve(po);
    const { body } = await convert(po);
    await staffPost(`/orders/${body.order.id}/allocate`);
    const inv = (await staffPost(`/orders/${body.order.id}/invoice`)).body.invoice as B2BInvoice;
    expect(inv.taxes).toEqual({ supplyType: "INTER_STATE", cgst: 0, sgst: 0, igst: BAND.gst * 2 });
    expect(inv.totals.total).toBe(BAND.total * 2);
  });
  it("won't invoice before the stock is allocated", async () => {
    const { order } = await approved([["BAND-1", 2]]);
    expect((await staffPost(`/orders/${order.id}/invoice`)).status).toBe(409);
  });
  it("cancels an order and puts its stock back; an invoiced order can't be cancelled", async () => {
    const { order } = await approved([["BAND-1", 3]]);
    await staffPost(`/orders/${order.id}/allocate`);
    expect(await InventoryItemModel.countDocuments({ status: "RESERVED" })).toBe(3);
    const res = await staffPost(`/orders/${order.id}/cancel`, { reason: "Customer asked" });
    expect(res.body.order.status).toBe("CANCELLED");
    expect(await InventoryItemModel.countDocuments({ status: "RESERVED" })).toBe(0);
    expect(await InventoryItemModel.countDocuments({ status: "AVAILABLE", type: "FINISHED_JEWELLERY" })).toBe(18);
    const inv = await invoiced();
    expect((await staffPost(`/orders/${inv.order.id}/cancel`, { reason: "too late" })).status).toBe(409);
  });
  it("freezes an issued invoice", async () => {
    const { invoice } = await invoiced();
    await expect(InvoiceModel.updateOne({ _id: invoice.id }, { $set: { "totals.total": 1 } })).rejects.toThrow(/Invoice/);
    await expect(InvoiceModel.deleteOne({ _id: invoice.id })).rejects.toThrow(/Invoice/);
  });
});

describe("offline payments — a record first, money only when verified and allocated", () => {
  it("accepts every offline method", async () => {
    for (const method of ["BANK_TRANSFER", "NEFT", "RTGS", "IMPS", "CHEQUE", "CASH", "OTHER"]) {
      const p = await recordedPayment(rs(1000), "accountant", { method });
      expect(p).toMatchObject({ method, status: "PENDING_VERIFICATION", source: "STAFF" });
    }
    expect((await staffPost("/payments", { customerId: ctx.customerId, amount: 100, ...payRec, method: "BITCOIN" }, "accountant")).status).toBe(400);
  });
  it("refuses nonsense: a zero or fractional amount, a future date, an unknown customer", async () => {
    for (const bad of [{ amount: 0 }, { amount: 100.5 }, { amount: -5 }, { receivedDate: addDays(businessDay(new Date()), 3) }, { receivedDate: "yesterday" }]) {
      expect((await staffPost("/payments", { customerId: ctx.customerId, amount: 100, ...payRec, ...bad }, "accountant")).status, JSON.stringify(bad)).toBe(400);
    }
    expect((await staffPost("/payments", { customerId: "507f1f77bcf86cd799439011", amount: 100, ...payRec }, "accountant")).status).toBe(404);
  });
  it("does NOT mark an invoice paid because a payment was entered — or even verified", async () => {
    const { invoice } = await invoiced();
    const p = await recordedPayment(invoice.totals.total);
    let inv = (await staff(`/invoices/${invoice.id}`, "accountant")).body.invoice as B2BInvoice;
    expect(inv).toMatchObject({ status: "UNPAID", paid: 0, balance: invoice.totals.total });
    expect((await position()).outstanding).toBe(invoice.totals.total);
    await staffPost(`/payments/${p.id}/verify`, {}, "admin");
    inv = (await staff(`/invoices/${invoice.id}`, "accountant")).body.invoice as B2BInvoice;
    expect(inv).toMatchObject({ status: "UNPAID", paid: 0 }); // verified money is still just money in the bank
    expect((await position()).outstanding).toBe(invoice.totals.total);
    expect(await AllocationModel.countDocuments()).toBe(0);
  });
  it("requires a second person to verify: nobody confirms their own entry", async () => {
    const p = await recordedPayment(rs(500));
    const self = await staffPost(`/payments/${p.id}/verify`, {}, "accountant");
    expect(self.status).toBe(409);
    expect(self.body.error.code).toBe("SELF_VERIFICATION");
    expect((await B2BPaymentModel.findById(p.id))!.status).toBe("PENDING_VERIFICATION");
    const ok = await staffPost(`/payments/${p.id}/verify`, { note: "Seen on the HDFC statement" }, "admin");
    expect(ok.body.payment).toMatchObject({ status: "VERIFIED", verifiedByName: "Test ADMIN" });
    expect((await staffPost(`/payments/${p.id}/verify`, {}, "admin")).status).toBe(409); // once
  });
  it("cannot apply a payment that hasn't been verified", async () => {
    const { invoice } = await invoiced();
    const p = await recordedPayment(invoice.totals.total);
    const res = await staffPost(`/payments/${p.id}/allocate`, { allocations: [{ invoiceId: invoice.id, amount: invoice.totals.total }] }, "accountant");
    expect(res.status).toBe(409);
    expect(await AllocationModel.countDocuments()).toBe(0);
  });
  it("applies a verified payment to invoices explicitly: partial payments, then settlement", async () => {
    const { order, invoice } = await invoiced([["BAND-1", 2]]);
    const pay = await verifiedPayment(invoice.totals.total);
    const half = Math.floor(invoice.totals.total / 2);
    let res = await staffPost(`/payments/${pay.id}/allocate`, { allocations: [{ invoiceId: invoice.id, amount: half }] }, "accountant");
    expect(res.body.payment).toMatchObject({ allocated: half, unallocated: invoice.totals.total - half });
    let inv = (await buyer(`/invoices/${invoice.id}`)).body.invoice as B2BInvoice;
    expect(inv).toMatchObject({ status: "PARTIALLY_PAID", paid: half, balance: invoice.totals.total - half });
    expect(inv.allocations).toEqual([expect.objectContaining({ amount: half, paymentNo: pay.paymentNo, method: "NEFT", invoiceNo: invoice.invoiceNo })]);
    expect((await position()).outstanding).toBe(invoice.totals.total - half);

    res = await staffPost(`/payments/${pay.id}/allocate`, { allocations: [{ invoiceId: invoice.id, amount: invoice.totals.total - half }] }, "accountant");
    expect(res.body.payment).toMatchObject({ allocated: invoice.totals.total, unallocated: 0 });
    inv = (await buyer(`/invoices/${invoice.id}`)).body.invoice as B2BInvoice;
    expect(inv).toMatchObject({ status: "PAID", paid: invoice.totals.total, balance: 0 });
    expect((await position()).outstanding).toBe(0);
    expect(((await buyer(`/orders/${order.id}`)).body.order as B2BSalesOrder).history.at(-1)).toMatchObject({ status: "SETTLED" });
  });
  it("splits one payment across several invoices, and several payments into one invoice", async () => {
    const a = await invoiced([["BAND-1", 2]]);
    const b = await invoiced([["BAND-1", 2]]);
    const big = await verifiedPayment(a.invoice.totals.total + 1000);
    await staffPost(`/payments/${big.id}/allocate`, { allocations: [{ invoiceId: a.invoice.id, amount: a.invoice.totals.total }, { invoiceId: b.invoice.id, amount: 1000 }] }, "accountant");
    const p2 = await verifiedPayment(b.invoice.totals.total - 1000);
    await staffPost(`/payments/${p2.id}/allocate`, { allocations: [{ invoiceId: b.invoice.id, amount: b.invoice.totals.total - 1000 }] }, "accountant");
    const invs = (await buyer("/invoices")).body.items as B2BInvoice[];
    expect(invs.map((i) => i.status)).toEqual(["PAID", "PAID"]);
    expect((await buyer(`/invoices/${b.invoice.id}`)).body.invoice.allocations).toHaveLength(2);
  });
  it("never over-applies: not beyond the invoice, not beyond the payment, not to another customer's invoice", async () => {
    const { invoice } = await invoiced([["BAND-1", 2]]);
    const pay = await verifiedPayment(invoice.totals.total * 2);
    expect((await staffPost(`/payments/${pay.id}/allocate`, { allocations: [{ invoiceId: invoice.id, amount: invoice.totals.total + 1 }] }, "accountant")).status).toBe(409);
    const small = await verifiedPayment(1000);
    expect((await staffPost(`/payments/${small.id}/allocate`, { allocations: [{ invoiceId: invoice.id, amount: 1001 }] }, "accountant")).status).toBe(409);
    // a payment recorded for Globex can't pay Acme's invoice
    const g = await staffPost("/payments", { customerId: ctx.globexId, amount: rs(10_000), reference: "UTRG", ...payRec }, "accountant");
    await staffPost(`/payments/${g.body.payment.id}/verify`, {}, "admin");
    expect((await staffPost(`/payments/${g.body.payment.id}/allocate`, { allocations: [{ invoiceId: invoice.id, amount: 100 }] }, "accountant")).status).toBe(404);
    expect(await AllocationModel.countDocuments()).toBe(0);
  });
  it("survives two allocations racing for one invoice: the invoice is never over-paid", async () => {
    const { invoice } = await invoiced([["BAND-1", 2]]);
    const p1 = await verifiedPayment(invoice.totals.total);
    const p2 = await verifiedPayment(invoice.totals.total);
    const [r1, r2] = await Promise.all([
      staffPost(`/payments/${p1.id}/allocate`, { allocations: [{ invoiceId: invoice.id, amount: invoice.totals.total }] }, "accountant"),
      staffPost(`/payments/${p2.id}/allocate`, { allocations: [{ invoiceId: invoice.id, amount: invoice.totals.total }] }, "accountant"),
    ]);
    expect([r1.status, r2.status].sort()).toEqual([200, 409]);
    expect((await AllocationModel.find({ invoiceId: invoice.id })).reduce((s, a) => s + a.amount, 0)).toBe(invoice.totals.total);
  });
  it("reverses a verified payment (a bounced cheque): the invoices it paid are owed again, and it can't be applied again", async () => {
    const { invoice } = await invoiced([["BAND-1", 2]]);
    const pay = await verifiedPayment(invoice.totals.total);
    await staffPost(`/payments/${pay.id}/allocate`, { allocations: [{ invoiceId: invoice.id, amount: invoice.totals.total }] }, "accountant");
    expect(((await buyer(`/invoices/${invoice.id}`)).body.invoice as B2BInvoice).status).toBe("PAID");
    const res = await staffPost(`/payments/${pay.id}/reverse`, { reason: "Cheque returned unpaid" }, "accountant");
    expect(res.body.payment.status).toBe("REVERSED");
    expect(((await buyer(`/invoices/${invoice.id}`)).body.invoice as B2BInvoice)).toMatchObject({ status: "UNPAID", paid: 0, balance: invoice.totals.total });
    expect((await position()).outstanding).toBe(invoice.totals.total);
    expect((await staffPost(`/payments/${pay.id}/allocate`, { allocations: [{ invoiceId: invoice.id, amount: 100 }] }, "accountant")).status).toBe(409);
    expect((await staffPost(`/payments/${pay.id}/reverse`, { reason: "again" }, "accountant")).status).toBe(409);
  });
  it("rejects a payment that never arrived, and a rejected one settles nothing", async () => {
    const p = await recordedPayment(rs(500));
    const res = await staffPost(`/payments/${p.id}/reject`, { reason: "Not on the statement" }, "admin");
    expect(res.body.payment).toMatchObject({ status: "REJECTED", rejectedReason: "Not on the statement" });
    expect((await staffPost(`/payments/${p.id}/verify`, {}, "admin")).status).toBe(409);
  });
  it("lets the customer report a payment — a claim on the record that settles nothing until it is verified", async () => {
    const { invoice } = await invoiced([["BAND-1", 2]]);
    const res = await buyerPost("/payments", { method: "RTGS", amount: invoice.totals.total, receivedDate: businessDay(new Date()), reference: "RTGS998877", bankName: "ICICI" });
    expect(res.status).toBe(201);
    expect(res.body.payment).toMatchObject({ source: "CUSTOMER", status: "PENDING_VERIFICATION", method: "RTGS", reference: "RTGS998877", recordedByName: "Ravi Shah", unallocated: 0 });
    expect(((await buyer(`/invoices/${invoice.id}`)).body.invoice as B2BInvoice).status).toBe("UNPAID");
    const out = (await buyer("/outstanding")).body as B2BOutstanding;
    expect(out.pendingPayments).toBe(invoice.totals.total);
    expect(out.unappliedPayments).toBe(0);
    // staff (not the customer) verify it, then apply it
    const verified = await staffPost(`/payments/${res.body.payment.id}/verify`, {}, "accountant");
    expect(verified.status).toBe(200);
    expect(((await buyer("/outstanding")).body as B2BOutstanding).unappliedPayments).toBe(invoice.totals.total);
    await staffPost(`/payments/${res.body.payment.id}/allocate`, { allocations: [{ invoiceId: invoice.id, amount: invoice.totals.total }] }, "accountant");
    expect(((await buyer(`/invoices/${invoice.id}`)).body.invoice as B2BInvoice).status).toBe("PAID");
    expect(((await buyer("/payments")).body.items as B2BPayment[])[0]).toMatchObject({ status: "VERIFIED", allocated: invoice.totals.total });
  });
  it("shows a customer only their own payments", async () => {
    await buyerPost("/payments", { method: "NEFT", amount: 5000, receivedDate: businessDay(new Date()) });
    expect(((await buyer("/payments", "globex")).body.items as unknown[]).length).toBe(0);
  });
  it("audits every step of a payment's life", async () => {
    const { invoice } = await invoiced([["BAND-1", 2]]);
    const pay = await verifiedPayment(invoice.totals.total);
    await staffPost(`/payments/${pay.id}/allocate`, { allocations: [{ invoiceId: invoice.id, amount: invoice.totals.total }] }, "accountant");
    await staffPost(`/payments/${pay.id}/reverse`, { reason: "Cheque bounced" }, "accountant");
    const actions = (await AuditLogModel.find({ action: /^b2b\./ }).lean()).map((l) => l.action);
    for (const a of ["b2b.payment_recorded", "b2b.payment_verified", "b2b.payment_allocated", "b2b.payment_reversed", "b2b.invoice_issued", "b2b.order_allocated", "b2b.po_approved"]) expect(actions, a).toContain(a);
  });
});

describe("the portal's dashboard and lists", () => {
  it("summarises what needs attention", async () => {
    const po = await submitPo([["BAND-1", 2]]);
    await staffPost(`/purchase-orders/${po.id}/quote`, {});
    await invoiced([["BAND-1", 2]]);
    await buyerPost("/payments", { method: "NEFT", amount: 1000, receivedDate: businessDay(new Date()) });
    const d = (await buyer("/dashboard")).body;
    expect(d.counts).toMatchObject({ openPurchaseOrders: 1, quotationsAwaitingYou: 1, unpaidInvoices: 1, paymentsPending: 1 });
    expect(d.actions.map((a: { kind: string }) => a.kind)).toEqual(expect.arrayContaining(["QUOTATION", "PAYMENT"]));
    expect(d.recentOrders).toHaveLength(1);
    expect(d.dueSoon).toHaveLength(1);
    expect(d.account.position.outstanding).toBe(BAND.total * 2);
  });
  it("lists orders and invoices with their status, and the seller sees every customer's", async () => {
    await invoiced([["BAND-1", 2]]);
    expect(((await buyer("/orders")).body.items as B2BSalesOrder[])[0]).toMatchObject({ status: "FULFILLED" });
    expect(((await staff("/orders")).body.items as B2BSalesOrder[])).toHaveLength(1);
    expect(((await staff("/invoices", "accountant")).body.items as B2BInvoice[])).toHaveLength(1);
    expect(((await staff("/customers")).body.items as { name: string; position: { outstanding: number } }[]).find((c) => c.name === "Acme Jewellers")!.position.outstanding).toBe(BAND.total * 2);
  });
});

// =====================================================================================================
describe("audit logs — the six events the spec names, with content that matters", () => {
  const entry = async (action: string) => (await AuditLogModel.findOne({ action }).sort({ _id: -1 }).lean())!;

  it("price override: a target price on a quotation line, with who, why and both numbers", async () => {
    const po = await submitPo([["BAND-1", 2]]);
    const q = await staffPost(`/purchase-orders/${po.id}/quote`, { lines: [{ sku: "BAND-1", unitTaxable: 6_000_000, note: "Matches a competing quote" }] });
    expect(q.status, JSON.stringify(q.body)).toBe(201);
    const log = await entry("b2b.price_override");
    expect(log.metadata).toMatchObject({ sku: "BAND-1", quantity: 2, standardUnitTaxable: BAND.taxable, agreedUnitTaxable: 6_000_000, targetUnitTaxable: 6_000_000, reason: "Matches a competing quote" });
    expect(log.actorEmail).toBeTruthy();
    expect(log.targetType).toBe("Quotation");
    expect(log.targetId).toBe(q.body.quotation.id);
  });

  it("discount: a percentage concession, with the rate and the resulting per-unit amount", async () => {
    const po = await submitPo([["BAND-1", 4]]);
    await staffPost(`/purchase-orders/${po.id}/quote`, { lines: [{ sku: "BAND-1", discountPercent: 5, note: "Volume order" }] });
    const log = await entry("b2b.discount_applied");
    expect(log.metadata).toMatchObject({ sku: "BAND-1", discountPercent: 5, standardUnitTaxable: BAND.taxable, reason: "Volume order" });
    expect((log.metadata as { discountPerUnit: number }).discountPerUnit).toBe(357_500); // 5% of 7,150,000
  });

  it("approval: both the direct-approve path and the quotation-accept path are audited, each naming who approved and at what total", async () => {
    const po = await submitPo([["BAND-1", 2]]);
    await approve(po);
    const direct = await entry("b2b.po_approved");
    expect(direct.metadata).toMatchObject({ poNo: po.poNo, via: "DIRECT", total: BAND.total * 2, by: "SELLER" });
    expect(direct.actorEmail).toBeTruthy();

    const po2 = await submitPo([["BAND-1", 2]]);
    const q = await staffPost(`/purchase-orders/${po2.id}/quote`, {});
    await buyerPost(`/quotations/${q.body.quotation.id}/accept`);
    const viaQuote = await entry("b2b.po_approved");
    expect(viaQuote.metadata).toMatchObject({ poNo: po2.poNo, via: "QUOTATION", by: "CUSTOMER" });
    expect(await AuditLogModel.countDocuments({ action: "b2b.quotation_approved" })).toBe(1);
  });

  it("rejection: a PO rejected by the seller, and a quotation declined by the customer, each with a reason and who did it", async () => {
    const po = await submitPo([["BAND-1", 2]]);
    await staffPost(`/purchase-orders/${po.id}/reject`, { reason: "Out of our range this season" });
    const sellerReject = await entry("b2b.po_rejected");
    expect(sellerReject.metadata).toMatchObject({ poNo: po.poNo, reason: "Out of our range this season", by: "SELLER" });

    const po2 = await submitPo([["BAND-1", 2]]);
    const q = await staffPost(`/purchase-orders/${po2.id}/quote`, {});
    await buyerPost(`/quotations/${q.body.quotation.id}/decline`, { reason: "Too dear" });
    const custDecline = await entry("b2b.quotation_rejected");
    expect(custDecline.metadata).toMatchObject({ quoteNo: q.body.quotation.quoteNo, reason: "Too dear", by: "CUSTOMER" });
    expect(await AuditLogModel.countDocuments({ action: "b2b.po_rejected" })).toBe(2); // the PO withdrawal is audited too
  });

  it("credit override: who overrode, why, the limit and the exact reasons that were overridden", async () => {
    const po = await submitPo([["BAND-1", 14]]);
    await approve(po);
    await convert(po, { creditOverride: { reason: "Approved by the owner, long relationship" } });
    const log = await entry("b2b.credit_overridden");
    expect(log.metadata).toMatchObject({ reason: "Approved by the owner, long relationship", limit: LIMIT, reasons: ["CREDIT_LIMIT_EXCEEDED"] });
    expect(log.actorEmail).toBeTruthy();
  });

  it("cancellation: a sales order cancelled, with what was released and what had already been invoiced", async () => {
    const { order } = await approved([["BAND-1", 3]]);
    await staffPost(`/orders/${order.id}/allocate`);
    await staffPost(`/orders/${order.id}/cancel`, { reason: "Customer asked" });
    const log = await entry("b2b.order_cancelled");
    expect(log.metadata).toMatchObject({ soNo: order.soNo, from: "ALLOCATED", reason: "Customer asked", releasedPieces: 3, invoicedBefore: 0 });

    const po = await submitPo([["BAND-1", 2]]);
    const cancelled = await staffPost(`/purchase-orders/${po.id}/cancel`, { reason: "Duplicate order" });
    expect(cancelled.body.purchaseOrder.status).toBe("CANCELLED");
    const poLog = await entry("b2b.po_cancelled");
    expect(poLog.metadata).toMatchObject({ poNo: po.poNo, reason: "Duplicate order" });
  });
});

describe("attachments — private, content-checked, and scoped to the right party", () => {
  const pdfBytes = Buffer.concat([Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d]), Buffer.from("1.4 fake pdf body")]);
  const attach = (path: string, bytes: Buffer, filename: string, who: "acme" | "manager") =>
    who === "manager"
      ? request(t.app).post(`/api/b2b${path}`).set(bearer(tokens.manager!)).attach("file", bytes, filename)
      : request(t.app).post(`/api/portal${path}`).set(bearer(tokens.acme!)).attach("file", bytes, filename);

  it("lets the customer attach a PO document, download it, and remove only their own", async () => {
    const po = await submitPo([["BAND-1", 2]]);
    const up = await attach(`/purchase-orders/${po.id}/attachments`, pdfBytes, "purchase-order.pdf", "acme");
    expect(up.status, JSON.stringify(up.body)).toBe(201);
    expect(up.body.attachment).toMatchObject({ name: "purchase-order.pdf", mimeType: "application/pdf", size: pdfBytes.length, uploadedBy: "CUSTOMER" });
    const attId = up.body.attachment.id as string;

    const dl = await buyer(`/purchase-orders/${po.id}/attachments/${attId}`);
    expect(dl.status).toBe(200);
    expect(dl.headers["content-disposition"]).toContain("attachment");
    expect(dl.headers["x-content-type-options"]).toBe("nosniff");
    expect(dl.headers["cache-control"]).toContain("no-store");
    expect(Buffer.from(dl.body as Buffer).equals(pdfBytes)).toBe(true);

    // another customer cannot see or fetch it
    expect((await buyer(`/purchase-orders/${po.id}`, "globex")).status).toBe(404);
    expect((await buyer(`/purchase-orders/${po.id}/attachments/${attId}`, "globex")).status).toBe(404);

    const realDelete = await request(t.app).delete(`/api/portal/purchase-orders/${po.id}/attachments/${attId}`).set(bearer(tokens.acme!));
    expect(realDelete.status).toBe(204);
    expect((await buyer(`/purchase-orders/${po.id}`)).body.purchaseOrder.attachments).toHaveLength(0);
  });

  it("won't let one side remove a file the other side uploaded", async () => {
    const po = await submitPo([["BAND-1", 2]]);
    const up = await attach(`/purchase-orders/${po.id}/attachments`, pdfBytes, "customer-po.pdf", "acme");
    const attId = up.body.attachment.id as string;
    const sellerTryDelete = await request(t.app).delete(`/api/b2b/purchase-orders/${po.id}/attachments/${attId}`).set(bearer(tokens.manager!));
    expect(sellerTryDelete.status).toBe(409);
    expect((await buyer(`/purchase-orders/${po.id}`)).body.purchaseOrder.attachments).toHaveLength(1);
  });

  it("sniffs real content, never trusting the filename or claimed type — and enforces size and count limits", async () => {
    const po = await submitPo([["BAND-1", 2]]);
    const fake = await attach(`/purchase-orders/${po.id}/attachments`, Buffer.from("not really a pdf"), "invoice.pdf", "acme");
    expect(fake.status).toBe(400);
    const empty = await attach(`/purchase-orders/${po.id}/attachments`, Buffer.alloc(0), "empty.pdf", "acme");
    expect(empty.status).toBe(400);
    const big = Buffer.concat([Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d]), Buffer.alloc(6 * 1024 * 1024)]);
    const tooBig = await request(t.app).post(`/api/portal/purchase-orders/${po.id}/attachments`).set(bearer(tokens.acme!)).attach("file", big, "big.pdf");
    expect([400, 413]).toContain(tooBig.status);
    for (let i = 0; i < 10; i++) expect((await attach(`/purchase-orders/${po.id}/attachments`, pdfBytes, `f${i}.pdf`, "acme")).status).toBe(201);
    expect((await attach(`/purchase-orders/${po.id}/attachments`, pdfBytes, "one-too-many.pdf", "acme")).status).toBe(409);
  });

  it("stops accepting new files once the PO leaves the editable statuses, but a seller may still attach up to APPROVED", async () => {
    const po = await submitPo([["BAND-1", 2]]);
    await approve(po);
    expect((await attach(`/purchase-orders/${po.id}/attachments`, pdfBytes, "too-late.pdf", "acme")).status).toBe(409);
    expect((await attach(`/purchase-orders/${po.id}/attachments`, pdfBytes, "seller-note.pdf", "manager")).status).toBe(201);
  });
});

describe("draft quotations — prepared before they're shown to the customer", () => {
  it("saves a draft the customer cannot see, then issues it — or discards it instead", async () => {
    const po = await submitPo([["BAND-1", 2]]);
    const draft = await staffPost(`/purchase-orders/${po.id}/quote`, { lines: [{ sku: "BAND-1", discountPercent: 5, note: "Draft pending manager sign-off" }], issue: false });
    expect(draft.status, JSON.stringify(draft.body)).toBe(201);
    expect(draft.body.quotation.status).toBe("DRAFT");
    expect((await buyer(`/quotations`)).body.items).toHaveLength(0); // not visible yet
    expect((await buyer(`/purchase-orders/${po.id}`)).body.purchaseOrder.status).toBe("SUBMITTED"); // untouched

    const issued = await staffPost(`/quotations/${draft.body.quotation.id}/issue`);
    expect(issued.status, JSON.stringify(issued.body)).toBe(200);
    expect(issued.body.quotation.status).toBe("QUOTED");
    expect((await buyer(`/quotations`)).body.items).toHaveLength(1);
    expect((await buyer(`/purchase-orders/${po.id}`)).body.purchaseOrder.status).toBe("QUOTED");
  });

  it("discards a draft without ever exposing it or touching the PO", async () => {
    const po = await submitPo([["BAND-1", 2]]);
    const draft = await staffPost(`/purchase-orders/${po.id}/quote`, { issue: false });
    const discarded = await staffPost(`/quotations/${draft.body.quotation.id}/discard`);
    expect(discarded.status, JSON.stringify(discarded.body)).toBe(200);
    expect(discarded.body.quotation.status).toBe("REJECTED");
    expect((await buyer(`/purchase-orders/${po.id}`)).body.purchaseOrder.status).toBe("SUBMITTED");
    expect((await staffPost(`/quotations/${draft.body.quotation.id}/issue`)).status).toBe(409);
  });
});

describe("release — giving back stock that was allocated but never invoiced", () => {
  it("releases held pieces back to available and returns the order to CONFIRMED", async () => {
    const { order } = await approved([["BAND-1", 3]]);
    await staffPost(`/orders/${order.id}/allocate`);
    expect(await InventoryItemModel.countDocuments({ status: "RESERVED" })).toBe(3);
    const res = await staffPost(`/orders/${order.id}/release`);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.order.status).toBe("CONFIRMED");
    expect(await InventoryItemModel.countDocuments({ status: "RESERVED" })).toBe(0);
    expect(await InventoryItemModel.countDocuments({ status: "AVAILABLE", type: "FINISHED_JEWELLERY" })).toBe(18); // every piece from the fixture, none held
    expect((await staffPost(`/orders/${order.id}/release`)).status).toBe(409); // nothing left to release
  });

  it("won't release an order that was never allocated", async () => {
    const { order } = await approved([["BAND-1", 2]]);
    expect((await staffPost(`/orders/${order.id}/release`)).status).toBe(409);
  });
});

describe("partial invoicing — one order, several invoices", () => {
  it("invoices a chosen subset of the allocated lines, leaving the rest allocated for later", async () => {
    const { order } = await approved([["BAND-1", 4], ["RING-1-12", 2]]);
    await staffPost(`/orders/${order.id}/allocate`);
    const bandLineIndex = order.lines.findIndex((l) => l.sku === "BAND-1");
    const first = await staffPost(`/orders/${order.id}/invoice`, { lines: [{ lineIndex: bandLineIndex, quantity: 2 }] });
    expect(first.status, JSON.stringify(first.body)).toBe(201);
    expect(first.body.invoice).toMatchObject({ sequence: 1, totals: { total: BAND.total * 2 } });
    expect(first.body.invoice.lines).toHaveLength(1);
    const afterFirst = (await staff(`/orders/${order.id}`)).body.order as B2BSalesOrder;
    expect(afterFirst.status).toBe("PARTIALLY_FULFILLED");
    expect(afterFirst.invoices).toHaveLength(1);
    expect(afterFirst.progress.find((p) => p.sku === "BAND-1")).toMatchObject({ quantity: 4, allocated: 2, invoiced: 2 });

    const second = await staffPost(`/orders/${order.id}/invoice`); // the rest, defaulted
    expect(second.status, JSON.stringify(second.body)).toBe(201);
    expect(second.body.invoice.sequence).toBe(2);
    const afterSecond = (await staff(`/orders/${order.id}`)).body.order as B2BSalesOrder;
    expect(afterSecond.status).toBe("FULFILLED");
    expect(afterSecond.invoices).toHaveLength(2);
    expect(afterSecond.invoices.reduce((s: number, i: { total: number }) => s + i.total, 0)).toBe(afterSecond.totals.total);
  });
});

describe("the expiry sweep — quotations and the PO waiting on them", () => {
  it("expires a stale quotation and the PO in the same pass, and is idempotent", async () => {
    const po = await submitPo([["BAND-1", 2]]);
    const q = await staffPost(`/purchase-orders/${po.id}/quote`, {});
    await QuotationModel.collection.updateOne({ quoteNo: q.body.quotation.quoteNo }, { $set: { validUntil: new Date(Date.now() - 1000) } });
    // the lazy "refresh-before-read" pattern means the read itself sweeps stale quotations — no timer needed here.
    const seen = (await staff(`/quotations/${q.body.quotation.id}`)).body.quotation;
    expect(seen.status).toBe("EXPIRED");
    expect((await staff(`/purchase-orders/${po.id}`)).body.purchaseOrder.status).toBe("EXPIRED");
    expect(await AuditLogModel.countDocuments({ action: "b2b.quotation_expired" })).toBe(1);
    // reading it again does not re-audit the same expiry
    await staff(`/quotations/${q.body.quotation.id}`);
    expect(await AuditLogModel.countDocuments({ action: "b2b.quotation_expired" })).toBe(1);
  });

  it("does not expire a quotation still under negotiation before its own deadline", async () => {
    const po = await submitPo([["BAND-1", 2]]);
    const q = await staffPost(`/purchase-orders/${po.id}/quote`, { validDays: 10 });
    expect((await staff(`/quotations/${q.body.quotation.id}`)).body.quotation.status).toBe("QUOTED");
  });
});

// =====================================================================================================
describe("accounting: every completed financial transaction posts a balanced journal entry", () => {
  const acct = (path: string, who = "accountant") => request(t.app).get(`/api/accounting${path}`).set(bearer(tokens[who]!));
  const acctPost = (path: string, body: object = {}, who = "accountant") => request(t.app).post(`/api/accounting${path}`).set(bearer(tokens[who]!)).send(body);
  const line = (entry: { lines: { accountCode: string; direction: string; amount: number }[] }, code: string) => entry.lines.find((l) => l.accountCode === code);

  it("invoicing posts Dr AR / Cr Sales+GST and, from the sold pieces' own book cost, Dr COGS / Cr Inventory", async () => {
    const { invoice } = await invoiced([["BAND-1", 2]]);
    const entries = await AccountingEntryModel.find({ referenceType: "SALES_INVOICE", referenceId: invoice.id }).lean();
    expect(entries).toHaveLength(1);
    const j = entries[0]!;
    expect(j.totalDebit).toBe(j.totalCredit); // never anything else — postJournal refuses an unbalanced entry
    expect(line(j, "1100")).toMatchObject({ direction: "DEBIT", amount: invoice.totals.total }); // Accounts Receivable
    expect(line(j, "4000")).toMatchObject({ direction: "CREDIT", amount: invoice.totals.taxable }); // Sales (no discount on this order, so gross = taxable)
    expect(line(j, "2200")).toMatchObject({ direction: "CREDIT", amount: invoice.totals.gst }); // GST Payable
    expect(line(j, "4900")).toBeUndefined(); // no discount on this order — Discount Given is simply not posted (postJournal drops zero lines)
    expect(line(j, "5100")).toMatchObject({ direction: "DEBIT", amount: 20000 }); // COGS: 2 pieces at their own book cost of 100_00 each
    expect(line(j, "1200")).toMatchObject({ direction: "CREDIT", amount: 20000 }); // Inventory reduced by the same cost
  });

  it("a concession shows up as its own Discount Given line, never invisibly netted into Sales", async () => {
    const po = await submitPo([["BAND-1", 2]]);
    const quoteRes = await staffPost(`/purchase-orders/${po.id}/quote`, { validDays: 10, lines: [{ sku: "BAND-1", discountPercent: 10, note: "Loyalty discount" }] });
    expect(quoteRes.status, JSON.stringify(quoteRes.body)).toBe(201);
    const accept = await buyerPost(`/quotations/${quoteRes.body.quotation.id}/accept`);
    expect(accept.status, JSON.stringify(accept.body)).toBe(200);
    const conv = await convert(po);
    expect(conv.status, JSON.stringify(conv.body)).toBe(201);
    const order = (conv.body.order as B2BSalesOrder).id;
    await staffPost(`/orders/${order}/allocate`);
    const inv = await staffPost(`/orders/${order}/invoice`);
    expect(inv.status, JSON.stringify(inv.body)).toBe(201);
    const invoice = inv.body.invoice as B2BInvoice;
    const discount = invoice.lines.reduce((s, l) => s + l.lineDiscount, 0);
    expect(discount).toBeGreaterThan(0);
    const j = (await AccountingEntryModel.findOne({ referenceType: "SALES_INVOICE", referenceId: invoice.id }).lean())!;
    expect(line(j, "4900")).toMatchObject({ direction: "DEBIT", amount: discount });
    expect(line(j, "4000")!.amount).toBe(invoice.totals.taxable + discount); // Sales is credited at the GROSS, pre-discount amount
    expect(j.totalDebit).toBe(j.totalCredit);
  });

  it("payment allocation posts Dr Bank / Cr AR for exactly what was applied, and reversal posts the exact opposite", async () => {
    const { invoice } = await invoiced([["BAND-1", 2]]);
    const payment = await verifiedPayment(invoice.totals.total);
    const alloc = await staffPost(`/payments/${payment.id}/allocate`, { allocations: [{ invoiceId: invoice.id, amount: invoice.totals.total }] }, "accountant");
    expect(alloc.status, JSON.stringify(alloc.body)).toBe(200);

    const received = await AccountingEntryModel.find({ referenceType: "PAYMENT_RECEIVED", referenceId: payment.id }).lean();
    expect(received).toHaveLength(1);
    expect(received[0]!.totalDebit).toBe(received[0]!.totalCredit);
    expect(line(received[0]!, "1020")).toMatchObject({ direction: "DEBIT", amount: invoice.totals.total }); // Bank (NEFT, not cash)
    expect(line(received[0]!, "1100")).toMatchObject({ direction: "CREDIT", amount: invoice.totals.total }); // AR reduced

    const rev = await staffPost(`/payments/${payment.id}/reverse`, { reason: "Cheque bounced" }, "admin");
    expect(rev.status, JSON.stringify(rev.body)).toBe(200);
    const reversal = await AccountingEntryModel.findOne({ referenceType: "PAYMENT_RECEIVED", referenceId: payment.id, journalNo: { $ne: received[0]!.journalNo } }).lean();
    expect(reversal).toBeTruthy();
    expect(line(reversal!, "1020")).toMatchObject({ direction: "CREDIT", amount: invoice.totals.total }); // opposite of the original
    expect(line(reversal!, "1100")).toMatchObject({ direction: "DEBIT", amount: invoice.totals.total });
    expect(reversal!.totalDebit).toBe(reversal!.totalCredit);
  });

  it("a cash payment lands in the Cash account, not Bank", async () => {
    const { invoice } = await invoiced([["BAND-1", 2]]);
    const recorded = await recordedPayment(invoice.totals.total, "accountant", { method: "CASH", bankName: undefined });
    const verified = await staffPost(`/payments/${recorded.id}/verify`, {}, "admin");
    expect(verified.status, JSON.stringify(verified.body)).toBe(200);
    const payment = verified.body.payment as B2BPayment;
    await staffPost(`/payments/${payment.id}/allocate`, { allocations: [{ invoiceId: invoice.id, amount: invoice.totals.total }] }, "accountant");
    const j = (await AccountingEntryModel.findOne({ referenceType: "PAYMENT_RECEIVED", referenceId: payment.id }).lean())!;
    expect(line(j, "1010")).toMatchObject({ direction: "DEBIT", amount: invoice.totals.total }); // Cash
    expect(line(j, "1020")).toBeUndefined();
  });

  it("the receivables dashboard, outstanding list and ageing report agree with the invoice", async () => {
    const { invoice } = await invoiced([["BAND-1", 2]]);
    const dash = await acct("/receivables/dashboard");
    expect(dash.status, JSON.stringify(dash.body)).toBe(200);
    expect(dash.body.totalOutstanding).toBeGreaterThanOrEqual(invoice.totals.total);
    expect(dash.body.customersWithOutstanding).toBeGreaterThanOrEqual(1);

    const out = await acct("/receivables/outstanding");
    expect(out.status).toBe(200);
    const row = out.body.items.find((i: { invoiceId: string }) => i.invoiceId === invoice.id);
    expect(row).toMatchObject({ balance: invoice.totals.total, status: "UNPAID" });

    const paid = await verifiedPayment(invoice.totals.total);
    await staffPost(`/payments/${paid.id}/allocate`, { allocations: [{ invoiceId: invoice.id, amount: invoice.totals.total }] }, "accountant");
    const out2 = await acct("/receivables/outstanding");
    expect(out2.body.items.find((i: { invoiceId: string }) => i.invoiceId === invoice.id)).toBeUndefined(); // settled — no longer outstanding

    const ageing = await acct("/receivables/ageing");
    expect(ageing.status).toBe(200);
    expect(ageing.body.overall).toHaveProperty("current");
  });

  it("chart of accounts: a system account's role can't be left without a holder", async () => {
    const list = await acct("/accounts");
    expect(list.status, JSON.stringify(list.body)).toBe(200);
    const ar = list.body.items.find((a: { systemRole?: string }) => a.systemRole === "ACCOUNTS_RECEIVABLE");
    expect(ar).toBeTruthy();
    const deactivate = await request(t.app).patch(`/api/accounting/accounts/${ar.id}`).set(bearer(tokens.accountant!)).send({ isActive: false });
    expect(deactivate.status, JSON.stringify(deactivate.body)).toBe(409);
    expect(deactivate.body.error.message).toMatch(/only account holding/);
  });

  it("credit note: reduces AR, debits Sales and GST Payable, and cancellation reverses it", async () => {
    const { invoice } = await invoiced([["BAND-1", 2]]);
    const created = await acctPost("/credit-notes", { customerId: ctx.customerId, invoiceId: invoice.id, reason: "SALES_RETURN", taxableValue: invoice.totals.taxable, gst: invoice.totals.gst });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const cn = created.body.creditNote;
    expect(cn.total).toBe(invoice.totals.taxable + invoice.totals.gst);
    const j = (await AccountingEntryModel.findOne({ referenceType: "CREDIT_NOTE", referenceId: cn.id }).lean())!;
    expect(line(j, "1100")).toMatchObject({ direction: "CREDIT", amount: cn.total });
    expect(line(j, "4000")).toMatchObject({ direction: "DEBIT", amount: invoice.totals.taxable });
    expect(line(j, "2200")).toMatchObject({ direction: "DEBIT", amount: invoice.totals.gst });
    expect(j.totalDebit).toBe(j.totalCredit);

    const cancelled = await acctPost(`/credit-notes/${cn.id}/cancel`, { reason: "Issued in error" });
    expect(cancelled.status, JSON.stringify(cancelled.body)).toBe(200);
    expect(cancelled.body.creditNote.status).toBe("CANCELLED");
    const all = await AccountingEntryModel.find({ referenceType: "CREDIT_NOTE", referenceId: cn.id }).lean();
    expect(all).toHaveLength(2); // the original and its reversal
    const totalAcrossBoth = all.reduce((s, e) => s + e.totalDebit, 0) - all.reduce((s, e) => s + e.totalCredit, 0);
    expect(totalAcrossBoth).toBe(0); // net effect of issue + cancel is nothing
  });

  it("a credit note reduces what B2B shows as owed too — the invoice's own balance, the customer's outstanding/ageing, and their credit position, not just the GL", async () => {
    const { invoice } = await invoiced([["BAND-1", 2]]);
    const half = Math.floor(invoice.totals.taxable / 2);
    const gstHalf = Math.floor(invoice.totals.gst / 2);
    const credited = half + gstHalf;

    const created = await acctPost("/credit-notes", { customerId: ctx.customerId, invoiceId: invoice.id, reason: "SALES_RETURN", taxableValue: half, gst: gstHalf });
    expect(created.status, JSON.stringify(created.body)).toBe(201);

    const inv = (await buyer(`/invoices/${invoice.id}`)).body.invoice as B2BInvoice;
    expect(inv).toMatchObject({ paid: 0, credited, balance: invoice.totals.total - credited, status: "PARTIALLY_PAID" });

    const out = (await buyer("/outstanding")).body as B2BOutstanding;
    expect(out.invoices.find((i) => i.id === invoice.id)).toMatchObject({ balance: invoice.totals.total - credited });
    expect(out.position.outstanding).toBe(invoice.totals.total - credited);

    // cancelling the credit note hands the full balance back
    const cn = created.body.creditNote;
    expect((await acctPost(`/credit-notes/${cn.id}/cancel`, { reason: "test" })).status).toBe(200);
    const invAfter = (await buyer(`/invoices/${invoice.id}`)).body.invoice as B2BInvoice;
    expect(invAfter).toMatchObject({ credited: 0, balance: invoice.totals.total });
  });

  it("only accounting.manage can write; accounting.view is enough to read", async () => {
    expect((await acct("/receivables/dashboard", "viewer")).status).toBe(200);
    expect((await acctPost("/accounts", { code: "9999", name: "Test", type: "ASSET" }, "viewer")).status).toBe(403);
    expect((await acctPost("/accounts", { code: "9999", name: "Test", type: "ASSET" }, "manager")).status).toBe(403); // B2B_MANAGER has no accounting permission at all
    expect((await acctPost("/accounts", { code: "9999", name: "Petty Cash Box", type: "ASSET" }, "accountant")).status).toBe(201);
  });

  it("the trial balance always balances — proof, not just a report", async () => {
    await invoiced([["BAND-1", 2]]);
    const tb = await acct("/trial-balance");
    expect(tb.status, JSON.stringify(tb.body)).toBe(200);
    expect(tb.body.totalDebit).toBe(tb.body.totalCredit);
    expect(tb.body.rows.length).toBeGreaterThan(0);
  });
});
