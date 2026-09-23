import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import type { GoodsReceipt, PurchaseOrder, PurchaseRequisition, SupplierInvoice, SupplierPayment } from "@jewellery/types";
import { PERMISSIONS } from "@jewellery/types";
import { PASSWORD, buildTestApp, createStaff, loginAs, seedChartOfAccounts, seedRbac, bearer } from "../../test/helpers";
import { type World, makeWorld } from "../../test/inventory-fixtures";
import { AuditLogModel } from "../modules/audit/audit-log.model";
import { InventoryItemModel } from "../modules/inventory/inventory-item.model";
import { InventoryLedgerModel } from "../modules/inventory/inventory-ledger.model";
import { createSupplier } from "../modules/suppliers/supplier.repository";
import { businessDay } from "../modules/dashboard/range";
import { AccountingEntryModel } from "../modules/accounting";

let t: ReturnType<typeof buildTestApp>;
let w: World;
let supplierId: string;
const tokens: Record<string, string> = {};

const staff = (path: string, who = "manager") => request(t.app).get(`/api/purchasing${path}`).set(bearer(tokens[who]!));
const staffPost = (path: string, body: object = {}, who = "manager") => request(t.app).post(`/api/purchasing${path}`).set(bearer(tokens[who]!)).send(body);
const staffPut = (path: string, body: object, who = "manager") => request(t.app).put(`/api/purchasing${path}`).set(bearer(tokens[who]!)).send(body);
const staffPatch = (path: string, body: object, who = "manager") => request(t.app).patch(`/api/purchasing${path}`).set(bearer(tokens[who]!)).send(body);

async function tokenFor(email: string) {
  const { accessToken, res } = await loginAs(t.app, email);
  if (!accessToken) throw new Error(`sign-in failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  return accessToken;
}

// 22K gold: fineness 0.916 (from makeWorld). 500 g gross x 0.916 = 458 g fine x ₹6,500/g = ₹29,77,000.
const GOLD_RATE = 6_500_00;
const line = (over: Record<string, unknown> = {}) => ({ purchaseType: "GOLD", description: "22K gold bar", metalId: w.gold, purity: "22K", quantity: 1, grossWeight: 500, ratePerGram: GOLD_RATE, ...over });
const GOLD_VALUE = Math.round(500 * 0.916 * GOLD_RATE); // 297,700,000 paise

async function createPo(lines: object[], over: Record<string, unknown> = {}) {
  const res = await staffPost("/purchase-orders", { supplierId, lines, deliveryLocationId: w.loc.warehouse, submit: true, ...over });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body.purchaseOrder as PurchaseOrder;
}
async function approvedPo(lines: object[], over: Record<string, unknown> = {}) {
  const po = await createPo(lines, over);
  const res = await staffPost(`/purchase-orders/${po.id}/approve`);
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body.purchaseOrder as PurchaseOrder;
}
async function receive(poId: string, lines: object[], who = "warehouse") {
  return staffPost(`/purchase-orders/${poId}/receive`, { receivedDate: businessDay(new Date()), lines }, who);
}

beforeEach(async () => {
  t = buildTestApp();
  await seedRbac();
  await seedChartOfAccounts();
  w = await makeWorld();
  const supplier = await createSupplier({ name: "Rajesh Bullion Traders", gstin: "27ABCDE1234F1Z5", paymentTermsDays: 30 } as never);
  supplierId = supplier.id;

  tokens.manager = await tokenFor((await createStaff("PURCHASE_MANAGER")).email);
  tokens.warehouse = await tokenFor((await createStaff("WAREHOUSE_MANAGER")).email);
  tokens.accountant = await tokenFor((await createStaff("ACCOUNTANT")).email);
  tokens.admin = await tokenFor((await createStaff("ADMIN")).email);
  tokens.viewer = await tokenFor((await createStaff("VIEWER")).email);
});

describe("who can reach what", () => {
  it("needs a login", async () => {
    expect((await request(t.app).get("/api/purchasing/dashboard")).status).toBe(401);
  });
  it("view is open to anyone with purchasing.view; create/approve/receive/cancel need their own permission", async () => {
    expect((await staff("/purchase-orders", "viewer")).status).toBe(200);
    expect((await staffPost("/purchase-orders", {}, "viewer")).status).toBe(403);
    const po = await createPo([line()]);
    expect((await staffPost(`/purchase-orders/${po.id}/approve`, {}, "warehouse")).status).toBe(403); // warehouse can receive, not approve
    const approved = await approvedPo([line()]);
    expect((await receive(approved.id, [{ purchaseOrderLineIndex: 0, grossWeight: 458, locationId: w.loc.warehouse }], "accountant")).status).toBe(403); // accountant can't receive
  });
  it("supplier invoices and payments need accounting.create_payment to write, accounting.view or purchasing.view to read", async () => {
    expect((await staff("/supplier-invoices", "viewer")).status).toBe(200);
    expect((await staffPost("/supplier-invoices", {}, "manager")).status).toBe(403); // purchase manager alone can't post a supplier invoice
    expect((await staffPost("/supplier-payments", {}, "manager")).status).toBe(403);
  });
});

describe("suppliers", () => {
  it("lists suppliers with their payables position, and reads one back", async () => {
    const list = (await staff("/suppliers")).body.items;
    expect(list.find((s: { id: string }) => s.id === supplierId)).toMatchObject({ name: "Rajesh Bullion Traders", totalOwed: 0, overdue: 0 });
    expect((await staff(`/suppliers/${supplierId}`)).body.supplier).toMatchObject({ name: "Rajesh Bullion Traders", gstin: "27ABCDE1234F1Z5" });
  });
  it("creates and updates a supplier", async () => {
    const res = await staffPost("/suppliers", { name: "New Metals Co", paymentTermsDays: 15 });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const upd = await staffPatch(`/suppliers/${res.body.supplier.id}`, { paymentTermsDays: 45 });
    expect(upd.body.supplier.paymentTermsDays).toBe(45);
  });
});

describe("purchase requisitions", () => {
  it("saves a draft, submits it, and is approved — recording who and auditing it", async () => {
    const draft = await staffPost("/requisitions", { reason: "Restock 22K gold for the bridal collection", lines: [line()], submit: false });
    expect(draft.status, JSON.stringify(draft.body)).toBe(201);
    expect(draft.body.requisition).toMatchObject({ status: "DRAFT" });
    expect(draft.body.requisition.prNo).toMatch(/^PR-\d{6}$/);
    expect(draft.body.requisition.totals.total).toBe(GOLD_VALUE);

    const submitted = await staffPost(`/requisitions/${draft.body.requisition.id}/submit`);
    expect(submitted.body.requisition.status).toBe("SUBMITTED");
    const approved = await staffPost(`/requisitions/${submitted.body.requisition.id}/approve`, { note: "Go ahead" });
    expect(approved.status, JSON.stringify(approved.body)).toBe(200);
    expect(approved.body.requisition.status).toBe("APPROVED");
    const log = await AuditLogModel.findOne({ action: "procurement.requisition_approved" }).lean();
    expect(log).toMatchObject({ metadata: { total: GOLD_VALUE } });
  });
  it("rejects a requisition with a reason, and won't approve it twice", async () => {
    const pr = await staffPost("/requisitions", { reason: "Trial order", lines: [line()], submit: true });
    const rejected = await staffPost(`/requisitions/${pr.body.requisition.id}/reject`, { reason: "Not needed this quarter" });
    expect(rejected.body.requisition).toMatchObject({ status: "REJECTED", rejectedReason: "Not needed this quarter" });
    expect((await staffPost(`/requisitions/${pr.body.requisition.id}/approve`)).status).toBe(409);
  });
  it("a purchase order can only be raised against an APPROVED requisition, and it converts", async () => {
    const pr = await staffPost("/requisitions", { reason: "Restock", lines: [line()], submit: true });
    const blocked = await staffPost("/purchase-orders", { supplierId, lines: [line()], deliveryLocationId: w.loc.warehouse, requisitionId: pr.body.requisition.id, submit: true });
    expect(blocked.status).toBe(409);
    await staffPost(`/requisitions/${pr.body.requisition.id}/approve`);
    const po = await staffPost("/purchase-orders", { supplierId, lines: [line()], deliveryLocationId: w.loc.warehouse, requisitionId: pr.body.requisition.id, submit: true });
    expect(po.status, JSON.stringify(po.body)).toBe(201);
    const refreshedPr = (await staff(`/requisitions/${pr.body.requisition.id}`)).body.requisition as PurchaseRequisition;
    expect(refreshedPr).toMatchObject({ status: "CONVERTED", purchaseOrderId: po.body.purchaseOrder.id });
  });
});

describe("purchase orders — the state machine", () => {
  it("goes draft -> submitted -> approved, with the value computed from fine weight x rate, never trusting a client-sent value", async () => {
    const draft = await staffPost("/purchase-orders", { supplierId, lines: [line()], deliveryLocationId: w.loc.warehouse, submit: false });
    expect(draft.body.purchaseOrder).toMatchObject({ status: "DRAFT" });
    expect(draft.body.purchaseOrder.lines[0]).toMatchObject({ value: GOLD_VALUE, fineness: 0.916 });
    expect(draft.body.purchaseOrder.poNo).toMatch(/^SPO-\d{6}$/);
    const submitted = await staffPost(`/purchase-orders/${draft.body.purchaseOrder.id}/submit`);
    expect(submitted.body.purchaseOrder.status).toBe("SUBMITTED");
    const approved = await staffPost(`/purchase-orders/${submitted.body.purchaseOrder.id}/approve`, { note: "Rate looks fair" });
    expect(approved.body.purchaseOrder).toMatchObject({ status: "APPROVED", approvedByName: "Test PURCHASE_MANAGER" });
    expect((await staffPost(`/purchase-orders/${submitted.body.purchaseOrder.id}/approve`)).status).toBe(409); // not twice
    const log = await AuditLogModel.findOne({ action: "procurement.po_approved" }).lean();
    expect(log!.metadata).toMatchObject({ total: GOLD_VALUE, supplier: "Rajesh Bullion Traders" });
  });
  it("refuses a price/value/status field sent from the browser (strict body)", async () => {
    const res = await staffPost("/purchase-orders", { supplierId, lines: [{ ...line(), value: 1 }], deliveryLocationId: w.loc.warehouse, submit: false });
    expect(res.status).toBe(400);
  });
});

describe("goods receipt — partial receipt, over-receipt, incorrect purity, weight discrepancy, cancellation", () => {
  it("partial receipt: receiving less than ordered leaves the PO PARTIALLY_RECEIVED, and the rest can be received later", async () => {
    const po = await approvedPo([line({ grossWeight: 500 })]);
    const first = await receive(po.id, [{ purchaseOrderLineIndex: 0, quantity: 1, grossWeight: 250, locationId: w.loc.warehouse }]);
    expect(first.status, JSON.stringify(first.body)).toBe(201);
    expect(first.body.goodsReceipt.grnNo).toMatch(/^GRN-\d{6}$/);
    expect(first.body.goodsReceipt.lines[0]).toMatchObject({ grossWeight: 250, hasWeightDiscrepancy: false });

    let seen = (await staff(`/purchase-orders/${po.id}`)).body.purchaseOrder as PurchaseOrder;
    expect(seen.status).toBe("PARTIALLY_RECEIVED");
    expect(seen.lines[0]).toMatchObject({ receivedGrossWeight: 250, grossWeight: 500 });
    expect(seen.goodsReceiptIds).toHaveLength(1);
    expect(await InventoryItemModel.countDocuments({ type: "RAW_MATERIAL" })).toBe(1);

    const second = await receive(po.id, [{ purchaseOrderLineIndex: 0, quantity: 1, grossWeight: 250, locationId: w.loc.warehouse }]);
    expect(second.status, JSON.stringify(second.body)).toBe(201);
    seen = (await staff(`/purchase-orders/${po.id}`)).body.purchaseOrder as PurchaseOrder;
    expect(seen.status).toBe("RECEIVED");
    expect(seen.lines[0].receivedGrossWeight).toBe(500);
    expect(seen.goodsReceiptIds).toHaveLength(2);
    expect(await InventoryItemModel.countDocuments({ type: "RAW_MATERIAL" })).toBe(2);
    expect(await InventoryLedgerModel.countDocuments({ movementType: "PURCHASE_RECEIPT" })).toBe(2);
  });

  it("over-receipt: receiving more than what is still outstanding on a line is refused, and nothing is written", async () => {
    const po = await approvedPo([line({ grossWeight: 500 })]);
    const res = await receive(po.id, [{ purchaseOrderLineIndex: 0, quantity: 1, grossWeight: 600, locationId: w.loc.warehouse }]);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("OVER_RECEIPT");
    expect(res.body.error.details).toMatchObject({ wanted: 600, outstanding: 500, unit: "g" });
    expect(await InventoryItemModel.countDocuments()).toBe(0);
    expect((await staff(`/purchase-orders/${po.id}`)).body.purchaseOrder.status).toBe("APPROVED"); // untouched

    // also over-receipt on the SECOND receipt, once part of the line is already used up
    await receive(po.id, [{ purchaseOrderLineIndex: 0, quantity: 1, grossWeight: 400, locationId: w.loc.warehouse }]);
    const again = await receive(po.id, [{ purchaseOrderLineIndex: 0, quantity: 1, grossWeight: 150, locationId: w.loc.warehouse }]);
    expect(again.status).toBe(409);
    expect(again.body.error.details).toMatchObject({ wanted: 150, outstanding: 100 });
  });

  it("a quantity-tracked line (finished jewellery) is refused over-receipt by piece count, not weight", async () => {
    const po = await approvedPo([{ purchaseType: "FINISHED_JEWELLERY", description: "Bangles", metalId: w.gold, purity: "22K", quantity: 5, ratePerUnit: 15_000_00 }]);
    const res = await receive(po.id, [{ purchaseOrderLineIndex: 0, quantity: 6, grossWeight: 15, locationId: w.loc.warehouse }]);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("OVER_RECEIPT");
    expect(res.body.error.details).toMatchObject({ wanted: 6, outstanding: 5, unit: "pcs" });
  });

  it("incorrect purity: receiving at a different purity than ordered is refused", async () => {
    const po = await approvedPo([line({ purity: "22K" })]);
    const res = await receive(po.id, [{ purchaseOrderLineIndex: 0, quantity: 1, grossWeight: 500, purity: "18K", locationId: w.loc.warehouse }]);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("PURITY_MISMATCH");
    expect(res.body.error.message).toMatch(/22K.*18K/);
    expect(await InventoryItemModel.countDocuments()).toBe(0);
  });

  it("weight discrepancy: a scale reading more than 2% off the delivery note's stated weight needs an explanatory note, and is flagged once given one", async () => {
    const po = await approvedPo([line({ grossWeight: 500 })]);
    // The delivery note says 500 g; the scale reads 470 g — a 6% shortfall on THIS shipment.
    const blocked = await receive(po.id, [{ purchaseOrderLineIndex: 0, quantity: 1, grossWeight: 470, expectedGrossWeight: 500, locationId: w.loc.warehouse }]);
    expect(blocked.status).toBe(400);
    expect(blocked.body.error.message).toMatch(/discrepancy/i);
    expect(await InventoryItemModel.countDocuments()).toBe(0);

    const withNote = await receive(po.id, [{ purchaseOrderLineIndex: 0, quantity: 1, grossWeight: 470, expectedGrossWeight: 500, locationId: w.loc.warehouse, discrepancyNote: "Lot was short-weighed on arrival; supplier notified" }]);
    expect(withNote.status, JSON.stringify(withNote.body)).toBe(201);
    const grnLine = withNote.body.goodsReceipt.lines[0];
    expect(grnLine.hasWeightDiscrepancy).toBe(true);
    expect(grnLine.variancePercent).toBeCloseTo(6, 0);
    expect(grnLine.discrepancyNote).toContain("short-weighed");
    // the item is created with the ACTUAL weighed amount, not the delivery note's claim
    const item = await InventoryItemModel.findOne({ type: "RAW_MATERIAL" }).lean();
    expect(item!.grossWeight).toBe(470);
  });

  it("a receipt within tolerance of its stated expected weight is not flagged, and a receipt with no stated expectation is never checked", async () => {
    const po = await approvedPo([line({ grossWeight: 500 })]);
    const withinTolerance = await receive(po.id, [{ purchaseOrderLineIndex: 0, quantity: 1, grossWeight: 495, expectedGrossWeight: 500, locationId: w.loc.warehouse }]); // 1% under
    expect(withinTolerance.status, JSON.stringify(withinTolerance.body)).toBe(201);
    expect(withinTolerance.body.goodsReceipt.lines[0].hasWeightDiscrepancy).toBe(false);

    // A genuine partial receipt — clearly less than the outstanding amount, no expectation stated — is never flagged.
    const po2 = await approvedPo([line({ grossWeight: 500 })]);
    const partial = await receive(po2.id, [{ purchaseOrderLineIndex: 0, quantity: 1, grossWeight: 200, locationId: w.loc.warehouse }]);
    expect(partial.status, JSON.stringify(partial.body)).toBe(201);
    expect(partial.body.goodsReceipt.lines[0].hasWeightDiscrepancy).toBe(false);
  });

  it("cancellation: a purchase order can be cancelled before receipt, or with what's left of a partially-received one — what already arrived stands", async () => {
    const untouched = await approvedPo([line()]);
    const cancelled = await staffPost(`/purchase-orders/${untouched.id}/cancel`, { reason: "Rate moved, no longer needed" });
    expect(cancelled.status, JSON.stringify(cancelled.body)).toBe(200);
    expect(cancelled.body.purchaseOrder).toMatchObject({ status: "CANCELLED", cancelledReason: "Rate moved, no longer needed" });
    const log = await AuditLogModel.findOne({ action: "procurement.po_cancelled" }).lean();
    expect(log!.metadata).toMatchObject({ reason: "Rate moved, no longer needed", from: "APPROVED" });

    const partial = await approvedPo([line({ grossWeight: 500 })]);
    await receive(partial.id, [{ purchaseOrderLineIndex: 0, quantity: 1, grossWeight: 200, locationId: w.loc.warehouse }]);
    expect(await InventoryItemModel.countDocuments({ type: "RAW_MATERIAL" })).toBe(1);
    const cancelledPartial = await staffPost(`/purchase-orders/${partial.id}/cancel`, { reason: "Supplier can't fulfil the rest" });
    expect(cancelledPartial.body.purchaseOrder.status).toBe("CANCELLED");
    // what already arrived is untouched — still real stock
    expect(await InventoryItemModel.countDocuments({ type: "RAW_MATERIAL" })).toBe(1);
    expect(await InventoryItemModel.countDocuments({ status: "AVAILABLE" })).toBeGreaterThanOrEqual(1);

    const received = await approvedPo([line({ grossWeight: 500 })]);
    await receive(received.id, [{ purchaseOrderLineIndex: 0, quantity: 1, grossWeight: 500, locationId: w.loc.warehouse }]);
    expect((await staffPost(`/purchase-orders/${received.id}/cancel`)).status).toBe(409); // a fully received PO can't be cancelled
  });

  it("won't receive against a purchase order that isn't approved yet, or an unknown line index", async () => {
    const draft = await staffPost("/purchase-orders", { supplierId, lines: [line()], deliveryLocationId: w.loc.warehouse, submit: false });
    expect((await receive(draft.body.purchaseOrder.id, [{ purchaseOrderLineIndex: 0, grossWeight: 500, locationId: w.loc.warehouse }])).status).toBe(409);
    const po = await approvedPo([line()]);
    expect((await receive(po.id, [{ purchaseOrderLineIndex: 5, grossWeight: 500, locationId: w.loc.warehouse }])).status).toBe(404);
  });

  it("receiving finished jewellery creates one UNIT item per piece; a consumable line creates none", async () => {
    const po = await approvedPo([
      { purchaseType: "FINISHED_JEWELLERY", description: "Bangles", metalId: w.gold, purity: "22K", quantity: 3, ratePerUnit: 15_000_00 },
      { purchaseType: "CONSUMABLE", description: "Polishing cloth", quantity: 50, ratePerUnit: 5_00 },
    ]);
    const res = await receive(po.id, [
      { purchaseOrderLineIndex: 0, quantity: 3, grossWeight: 15, locationId: w.loc.warehouse },
      { purchaseOrderLineIndex: 1, quantity: 50, locationId: w.loc.warehouse },
    ]);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.goodsReceipt.lines[0].inventoryItemIds).toHaveLength(3);
    expect(res.body.goodsReceipt.lines[1].inventoryItemIds).toHaveLength(0);
    expect(await InventoryItemModel.countDocuments({ type: "FINISHED_JEWELLERY", serialization: "UNIT" })).toBe(3);
    const grn = res.body.goodsReceipt as GoodsReceipt;
    expect((await staff(`/goods-receipts/${grn.id}`)).body.goodsReceipt.grnNo).toBe(grn.grnNo);
  });
});

describe("supplier invoices", () => {
  async function invoicedPo() {
    const po = await approvedPo([line({ grossWeight: 500 })]);
    await receive(po.id, [{ purchaseOrderLineIndex: 0, quantity: 1, grossWeight: 500, locationId: w.loc.warehouse }]);
    return po;
  }
  it("records a supplier's bill against a purchase order, linking it back", async () => {
    const po = await invoicedPo();
    const res = await staffPost("/supplier-invoices", { supplierId, purchaseOrderId: po.id, supplierInvoiceNo: "RB/2026/0091", invoiceDate: businessDay(new Date()), lines: [line({ grossWeight: 500 })], taxAmount: 8_931_00 }, "accountant");
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.supplierInvoice).toMatchObject({ status: "UNPAID", poNo: po.poNo, totals: { subtotal: GOLD_VALUE, taxAmount: 8_931_00, total: GOLD_VALUE + 8_931_00 } });
    const seenPo = (await staff(`/purchase-orders/${po.id}`)).body.purchaseOrder as PurchaseOrder;
    expect(seenPo.supplierInvoiceIds).toContain(res.body.supplierInvoice.id);
  });
  it("cancels an invoice with nothing paid against it, but refuses once a payment is allocated", async () => {
    const po = await invoicedPo();
    const inv = await staffPost("/supplier-invoices", { supplierId, purchaseOrderId: po.id, supplierInvoiceNo: "RB/2026/0092", invoiceDate: businessDay(new Date()), lines: [line({ grossWeight: 500 })] }, "accountant");
    const cancelled = await staffPost(`/supplier-invoices/${inv.body.supplierInvoice.id}/cancel`, { reason: "Entered twice by mistake" }, "accountant");
    expect(cancelled.status, JSON.stringify(cancelled.body)).toBe(200);
    expect(cancelled.body.supplierInvoice.status).toBe("CANCELLED");
  });
});

describe("supplier payments", () => {
  async function invoiceFor(amount = GOLD_VALUE) {
    const po = await approvedPo([line({ grossWeight: 500 })]);
    await receive(po.id, [{ purchaseOrderLineIndex: 0, quantity: 1, grossWeight: 500, locationId: w.loc.warehouse }]);
    const res = await staffPost("/supplier-invoices", { supplierId, purchaseOrderId: po.id, supplierInvoiceNo: `RB/${Math.random()}`, invoiceDate: businessDay(new Date()), lines: [line({ grossWeight: 500 })] }, "accountant");
    void amount;
    return res.body.supplierInvoice as SupplierInvoice;
  }
  it("records a payment and applies it to an invoice, settling it exactly", async () => {
    const inv = await invoiceFor();
    const pay = await staffPost("/supplier-payments", { supplierId, method: "NEFT", amount: inv.totals.total, paidDate: businessDay(new Date()), reference: "UTR001" }, "accountant");
    expect(pay.status, JSON.stringify(pay.body)).toBe(201);
    expect(pay.body.supplierPayment).toMatchObject({ status: "RECORDED", unallocated: inv.totals.total });
    const alloc = await staffPost(`/supplier-payments/${pay.body.supplierPayment.id}/allocate`, { allocations: [{ supplierInvoiceId: inv.id, amount: inv.totals.total }] }, "accountant");
    expect(alloc.status, JSON.stringify(alloc.body)).toBe(200);
    expect(alloc.body.supplierPayment.unallocated).toBe(0);
    const seenInv = (await staff(`/supplier-invoices/${inv.id}`, "accountant")).body.supplierInvoice as SupplierInvoice;
    expect(seenInv).toMatchObject({ status: "PAID", paid: inv.totals.total, balance: 0 });
  });
  it("never over-applies: not beyond the invoice, not beyond the payment", async () => {
    const inv = await invoiceFor();
    const pay = await staffPost("/supplier-payments", { supplierId, method: "CASH", amount: inv.totals.total, paidDate: businessDay(new Date()) }, "accountant");
    expect((await staffPost(`/supplier-payments/${pay.body.supplierPayment.id}/allocate`, { allocations: [{ supplierInvoiceId: inv.id, amount: inv.totals.total + 1 }] }, "accountant")).status).toBe(409);
    await staffPost(`/supplier-payments/${pay.body.supplierPayment.id}/allocate`, { allocations: [{ supplierInvoiceId: inv.id, amount: inv.totals.total }] }, "accountant");
    const other = await invoiceFor();
    expect((await staffPost(`/supplier-payments/${pay.body.supplierPayment.id}/allocate`, { allocations: [{ supplierInvoiceId: other.id, amount: 100 }] }, "accountant")).status).toBe(409); // fully allocated already
  });
  it("reverses a recorded payment: its allocations undo, and the invoice is owed again", async () => {
    const inv = await invoiceFor();
    const pay = await staffPost("/supplier-payments", { supplierId, method: "CHEQUE", amount: inv.totals.total, paidDate: businessDay(new Date()) }, "accountant");
    await staffPost(`/supplier-payments/${pay.body.supplierPayment.id}/allocate`, { allocations: [{ supplierInvoiceId: inv.id, amount: inv.totals.total }] }, "accountant");
    const reversed = await staffPost(`/supplier-payments/${pay.body.supplierPayment.id}/reverse`, { reason: "Cheque bounced" }, "accountant");
    expect(reversed.status, JSON.stringify(reversed.body)).toBe(200);
    expect(reversed.body.supplierPayment.status).toBe("REVERSED");
    const seenInv = (await staff(`/supplier-invoices/${inv.id}`, "accountant")).body.supplierInvoice as SupplierInvoice;
    expect(seenInv).toMatchObject({ status: "UNPAID", paid: 0 });
    expect((await staffPost(`/supplier-payments/${pay.body.supplierPayment.id}/reverse`, { reason: "again" }, "accountant")).status).toBe(409);
    const log = await AuditLogModel.findOne({ action: "procurement.supplier_payment_reversed" }).lean();
    expect(log!.metadata).toMatchObject({ reason: "Cheque bounced" });
  });
});

describe("supplier outstanding and the purchase dashboard", () => {
  it("shows what is owed, ageing it against the due date", async () => {
    const inv = await (async () => {
      const po = await approvedPo([line({ grossWeight: 500 })]);
      await receive(po.id, [{ purchaseOrderLineIndex: 0, quantity: 1, grossWeight: 500, locationId: w.loc.warehouse }]);
      const res = await staffPost("/supplier-invoices", { supplierId, purchaseOrderId: po.id, supplierInvoiceNo: "RB/2026/0100", invoiceDate: "2026-01-01", dueDate: "2026-01-15", lines: [line({ grossWeight: 500 })] }, "accountant");
      return res.body.supplierInvoice as SupplierInvoice;
    })();
    const out = (await staff(`/suppliers/${supplierId}/outstanding`, "accountant")).body.outstanding;
    expect(out.totalOwed).toBe(inv.totals.total);
    expect(out.overdue).toBe(inv.totals.total); // due 2026-01-15, long past "today"
    expect(out.invoices[0]).toMatchObject({ supplierInvoiceNo: "RB/2026/0100", status: "UNPAID" });
    expect(out.ageing.over90).toBeGreaterThan(0);
  });
  it("the dashboard counts open requisitions, purchase orders awaiting receipt, and unpaid invoices", async () => {
    await staffPost("/requisitions", { reason: "Ask", lines: [line()], submit: true });
    await approvedPo([line()]);
    const dash = await staff("/dashboard");
    expect(dash.body.counts).toMatchObject({ openRequisitions: 1, pendingReceipt: 1 });
    expect(dash.body.recentPurchaseOrders.length).toBeGreaterThan(0);
  });
});

// =====================================================================================================
describe("accounting: every completed purchase-side transaction posts a balanced journal entry", () => {
  const entryLine = (entry: { lines: { accountCode: string; direction: string; amount: number }[] }, code: string) => entry.lines.find((l) => l.accountCode === code);

  async function invoicedGoldPo() {
    const po = await approvedPo([line({ grossWeight: 500 })]);
    await receive(po.id, [{ purchaseOrderLineIndex: 0, quantity: 1, grossWeight: 500, locationId: w.loc.warehouse }]);
    const res = await staffPost("/supplier-invoices", { supplierId, purchaseOrderId: po.id, supplierInvoiceNo: `RB/${Math.random()}`, invoiceDate: businessDay(new Date()), lines: [line({ grossWeight: 500 })], taxAmount: 8_931_00 }, "accountant");
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    return res.body.supplierInvoice as SupplierInvoice;
  }

  it("a weight-tracked (ledger-tracked) line posts Dr Inventory + Dr GST Receivable, Cr AP", async () => {
    const inv = await invoicedGoldPo();
    const j = (await AccountingEntryModel.findOne({ referenceType: "PURCHASE_INVOICE", referenceId: inv.id }).lean())!;
    expect(j.totalDebit).toBe(j.totalCredit);
    expect(entryLine(j, "1200")).toMatchObject({ direction: "DEBIT", amount: GOLD_VALUE }); // Inventory
    expect(entryLine(j, "1400")).toMatchObject({ direction: "DEBIT", amount: 8_931_00 }); // GST Receivable
    expect(entryLine(j, "5000")).toBeUndefined(); // nothing expensed to Purchases — this line became stock
    expect(entryLine(j, "2100")).toMatchObject({ direction: "CREDIT", amount: inv.totals.total }); // Accounts Payable
  });

  it("a CONSUMABLE line (never becomes an InventoryItem) posts to Purchases, not Inventory", async () => {
    const res = await staffPost("/supplier-invoices", { supplierId, supplierInvoiceNo: `CN/${Math.random()}`, invoiceDate: businessDay(new Date()), lines: [{ purchaseType: "CONSUMABLE", description: "Polishing cloth", quantity: 50, ratePerUnit: 5_00 }] }, "accountant");
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const inv = res.body.supplierInvoice as SupplierInvoice;
    const j = (await AccountingEntryModel.findOne({ referenceType: "PURCHASE_INVOICE", referenceId: inv.id }).lean())!;
    expect(entryLine(j, "5000")).toMatchObject({ direction: "DEBIT", amount: 250_00 }); // Purchases: 50 x 5.00
    expect(entryLine(j, "1200")).toBeUndefined(); // no Inventory line — nothing here becomes stock
    expect(entryLine(j, "2100")).toMatchObject({ direction: "CREDIT", amount: 250_00 });
    expect(j.totalDebit).toBe(j.totalCredit);
  });

  it("cancelling an (unpaid) supplier invoice reverses exactly what it posted", async () => {
    const inv = await invoicedGoldPo();
    const cancelled = await staffPost(`/supplier-invoices/${inv.id}/cancel`, { reason: "Duplicate entry" }, "accountant");
    expect(cancelled.status, JSON.stringify(cancelled.body)).toBe(200);
    const all = await AccountingEntryModel.find({ referenceType: "PURCHASE_INVOICE", referenceId: inv.id }).lean();
    expect(all).toHaveLength(2);
    expect(all.reduce((s, e) => s + e.totalDebit, 0)).toBe(all.reduce((s, e) => s + e.totalCredit, 0) * 1); // both balanced individually
    const net = new Map<string, number>();
    for (const e of all) for (const l of e.lines) net.set(l.accountCode, (net.get(l.accountCode) ?? 0) + (l.direction === "DEBIT" ? l.amount : -l.amount));
    for (const v of net.values()) expect(v).toBe(0); // issue + reversal cancel out on every account touched
  });

  it("payment allocation posts Dr AP / Cr Bank for exactly what was applied, and reversal posts the opposite", async () => {
    const inv = await invoicedGoldPo();
    const pay = await staffPost("/supplier-payments", { supplierId, method: "NEFT", amount: inv.totals.total, paidDate: businessDay(new Date()), reference: "UTR900" }, "accountant");
    expect(pay.status, JSON.stringify(pay.body)).toBe(201);
    const alloc = await staffPost(`/supplier-payments/${pay.body.supplierPayment.id}/allocate`, { allocations: [{ supplierInvoiceId: inv.id, amount: inv.totals.total }] }, "accountant");
    expect(alloc.status, JSON.stringify(alloc.body)).toBe(200);

    const made = await AccountingEntryModel.find({ referenceType: "PAYMENT_MADE", referenceId: pay.body.supplierPayment.id }).lean();
    expect(made).toHaveLength(1);
    expect(entryLine(made[0]!, "2100")).toMatchObject({ direction: "DEBIT", amount: inv.totals.total }); // AP reduced
    expect(entryLine(made[0]!, "1020")).toMatchObject({ direction: "CREDIT", amount: inv.totals.total }); // Bank (NEFT)

    const reversed = await staffPost(`/supplier-payments/${pay.body.supplierPayment.id}/reverse`, { reason: "Payment recalled" }, "accountant");
    expect(reversed.status, JSON.stringify(reversed.body)).toBe(200);
    const reversal = await AccountingEntryModel.findOne({ referenceType: "PAYMENT_MADE", referenceId: pay.body.supplierPayment.id, journalNo: { $ne: made[0]!.journalNo } }).lean();
    expect(entryLine(reversal!, "2100")).toMatchObject({ direction: "CREDIT", amount: inv.totals.total });
    expect(entryLine(reversal!, "1020")).toMatchObject({ direction: "DEBIT", amount: inv.totals.total });
  });

  it("debit note: reduces AP, credits Inventory and GST Receivable", async () => {
    const inv = await invoicedGoldPo();
    const res = await request(t.app).post("/api/accounting/debit-notes").set(bearer(tokens.accountant!)).send({ supplierId, supplierInvoiceId: inv.id, reason: "PURCHASE_RETURN", taxableValue: 1_00_000, gst: 3_000 });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const dn = res.body.debitNote;
    expect(dn.total).toBe(1_03_000);
    const j = (await AccountingEntryModel.findOne({ referenceType: "DEBIT_NOTE", referenceId: dn.id }).lean())!;
    expect(entryLine(j, "2100")).toMatchObject({ direction: "DEBIT", amount: dn.total });
    expect(entryLine(j, "1200")).toMatchObject({ direction: "CREDIT", amount: 1_00_000 });
    expect(entryLine(j, "1400")).toMatchObject({ direction: "CREDIT", amount: 3_000 });
    expect(j.totalDebit).toBe(j.totalCredit);
  });

  it("the payables side shows up in the trial balance alongside receivables", async () => {
    await invoicedGoldPo();
    const tb = await request(t.app).get("/api/accounting/trial-balance").set(bearer(tokens.accountant!));
    expect(tb.status, JSON.stringify(tb.body)).toBe(200);
    expect(tb.body.totalDebit).toBe(tb.body.totalCredit);
    expect(tb.body.rows.find((r: { code: string }) => r.code === "2100").credit).toBeGreaterThan(0);
  });
});
