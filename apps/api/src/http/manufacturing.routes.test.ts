import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import type { JobWorkOrder, ProductionOrder } from "@jewellery/types";
import { PASSWORD, buildTestApp, createStaff, loginAs, seedRbac, bearer } from "../../test/helpers";
import { type World, makeWorld, receive } from "../../test/inventory-fixtures";
import { AuditLogModel } from "../modules/audit/audit-log.model";
import { InventoryItemModel } from "../modules/inventory/inventory-item.model";
import { InventoryLedgerModel } from "../modules/inventory/inventory-ledger.model";
import { createProductCategory } from "../modules/catalog/product-category.repository";
import { createProduct } from "../modules/catalog/product.repository";
import { createSupplier } from "../modules/suppliers/supplier.repository";

let t: ReturnType<typeof buildTestApp>;
let w: World;
let productId: string;
let vendorId: string;
const tokens: Record<string, string> = {};

const staff = (path: string, who = "manager") => request(t.app).get(`/api/manufacturing${path}`).set(bearer(tokens[who]!));
const staffPost = (path: string, body: object = {}, who = "manager") => request(t.app).post(`/api/manufacturing${path}`).set(bearer(tokens[who]!)).send(body);

async function tokenFor(email: string) {
  const { accessToken, res } = await loginAs(t.app, email);
  if (!accessToken) throw new Error(`sign-in failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  return accessToken;
}

// A 500 g raw-gold batch, 22K (fineness 0.916), received into the warehouse — the material every test issues from.
async function rawGoldBatch(grossWeight = 500) {
  return receive(w, { type: "RAW_MATERIAL", serialization: "BATCH", grossWeight, stoneWeight: 0, locationId: w.loc.warehouse, cost: 30_00_000 });
}

async function bom(over: Record<string, unknown> = {}) {
  return { metalId: w.gold, purity: "22K", expectedGrossWeight: 500, expectedWastage: 10, ...over };
}

async function createPO(over: Record<string, unknown> = {}) {
  const res = await staffPost("/production-orders", { productId, quantity: 1, locationId: w.loc.workshop, bom: await bom(), ...over });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body.productionOrder as ProductionOrder;
}
async function issuedPO(itemIds: string[], over: Record<string, unknown> = {}) {
  const po = await createPO(over);
  const res = await staffPost(`/production-orders/${po.id}/issue-material`, { itemIds });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body.productionOrder as ProductionOrder;
}

async function createJW(over: Record<string, unknown> = {}) {
  const res = await staffPost("/job-work-orders", { vendorId, productId, issueDate: "2026-01-01", dueDate: "2026-01-15", locationId: w.loc.jobworker, bom: await bom(), makingCharges: 2_000_00, ...over });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body.jobWorkOrder as JobWorkOrder;
}
async function issuedJW(itemIds: string[], over: Record<string, unknown> = {}) {
  const jw = await createJW(over);
  const res = await staffPost(`/job-work-orders/${jw.id}/issue`, { itemIds });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body.jobWorkOrder as JobWorkOrder;
}

beforeEach(async () => {
  t = buildTestApp();
  await seedRbac();
  w = await makeWorld();
  const rings = await createProductCategory({ name: "Rings" });
  const product = await createProduct({ sku: "RING-MFG-1", name: "Signature Band", categoryId: rings.id, metalId: w.gold, purity: "22K", defaultGrossWeight: 10, defaultNetWeight: 10, isActive: true, images: [] } as never);
  productId = product.id;
  const vendor = await createSupplier({ name: "Ramesh Karigar Works", paymentTermsDays: 0 } as never);
  vendorId = vendor.id;

  tokens.manager = await tokenFor((await createStaff("PRODUCTION_MANAGER")).email);
  tokens.viewer = await tokenFor((await createStaff("VIEWER")).email);
  tokens.sales = await tokenFor((await createStaff("SALES_EXECUTIVE")).email);
});

describe("who can reach what", () => {
  it("needs a login", async () => {
    expect((await request(t.app).get("/api/manufacturing/dashboard")).status).toBe(401);
  });
  it("view is open to production.view; create/QC-approve each need their own permission", async () => {
    expect((await staff("/production-orders", "viewer")).status).toBe(200);
    expect((await staffPost("/production-orders", {}, "sales")).status).toBe(403);
    const po = await createPO();
    expect((await staffPost(`/production-orders/${po.id}/qc/pass`, {}, "sales")).status).toBe(403);
  });
});

describe("production order — the full flow: Production Order -> Material Issue -> Manufacturing -> QC -> Finished Jewellery -> Inventory", () => {
  it("issuing material moves real inventory through the ledger, never just a quantity update", async () => {
    const batch = await rawGoldBatch(500);
    const po = await createPO();
    expect(po.status).toBe("DRAFT");
    expect(po.productionOrderNo).toMatch(/^MO-\d{6}$/);

    const issued = await staffPost(`/production-orders/${po.id}/issue-material`, { itemIds: [batch.id] });
    expect(issued.status, JSON.stringify(issued.body)).toBe(200);
    expect(issued.body.productionOrder).toMatchObject({ status: "MATERIAL_ISSUED", issuedGrossWeight: 500 });

    const item = await InventoryItemModel.findById(batch.id).lean();
    expect(item!.status).toBe("IN_MANUFACTURING");
    expect(String(item!.locationId)).toBe(w.loc.workshop);
    const ledgerEntries = await InventoryLedgerModel.find({ itemId: batch.id }).lean();
    expect(ledgerEntries).toHaveLength(2); // #1 receipt into warehouse, #2 the manufacturing issue
    expect(ledgerEntries[1]).toMatchObject({ movementType: "MANUFACTURING_ISSUE", fromStatus: "AVAILABLE", toStatus: "IN_MANUFACTURING" });

    // can't issue an item that isn't AVAILABLE
    const again = await staffPost(`/production-orders/${(await createPO()).id}/issue-material`, { itemIds: [batch.id] });
    expect(again.status).toBe(409);
  });

  it("start -> submit for QC -> pass -> complete creates a real finished InventoryItem, ledgered, traceable back to the order", async () => {
    const batch = await rawGoldBatch(500);
    let po = await issuedPO([batch.id]);
    po = (await staffPost(`/production-orders/${po.id}/start`)).body.productionOrder;
    expect(po.status).toBe("IN_PROGRESS");

    const submitted = await staffPost(`/production-orders/${po.id}/submit-qc`, { actualGrossWeight: 490, actualWastage: 8, labourCost: 6_000_00 });
    expect(submitted.body.productionOrder).toMatchObject({ status: "QC_PENDING", actualGrossWeight: 490, actualWastage: 8, labourCost: 6_000_00 });

    const passed = await staffPost(`/production-orders/${po.id}/qc/pass`, { notes: "Within tolerance" });
    expect(passed.body.productionOrder).toMatchObject({ status: "QC_PASSED", qc: { status: "PASSED", notes: "Within tolerance" } });

    const completed = await staffPost(`/production-orders/${po.id}/complete`, { finishedPieces: [{ grossWeight: 480, stoneWeight: 0, quantity: 1 }], returnedItemIds: [], wastage: 20 });
    expect(completed.status, JSON.stringify(completed.body)).toBe(200);
    expect(completed.body.productionOrder.status).toBe("COMPLETED");
    expect(completed.body.productionOrder.reconciliation).toMatchObject({ issuedGrossWeight: 500, returnedGrossWeight: 0, finishedGrossWeight: 480, wastageGrossWeight: 20, discrepancyGrossWeight: 0, hasDiscrepancy: false });

    const finishedId = completed.body.productionOrder.finishedItems[0].itemId;
    const finished = await InventoryItemModel.findById(finishedId).lean();
    expect(finished).toMatchObject({ type: "FINISHED_JEWELLERY", status: "AVAILABLE", grossWeight: 480 });
    expect(String(finished!.productId)).toBe(productId);
    expect(String(finished!.manufacturingInfo!.productionOrderId)).toBe(po.id);
    expect(await InventoryLedgerModel.countDocuments({ itemId: finishedId, movementType: "MANUFACTURING_RECEIPT" })).toBe(1);

    const log = await AuditLogModel.findOne({ action: "manufacturing.completed" }).lean();
    expect(log!.metadata).toMatchObject({ finishedGrossWeight: 480, wastageGrossWeight: 20 });
  });

  it("QC failure sends it back for rework, and a second pass completes normally", async () => {
    const batch = await rawGoldBatch(500);
    let po = await issuedPO([batch.id]);
    po = (await staffPost(`/production-orders/${po.id}/start`)).body.productionOrder;
    po = (await staffPost(`/production-orders/${po.id}/submit-qc`, { actualGrossWeight: 490, actualWastage: 5, labourCost: 1000 })).body.productionOrder;
    const failed = await staffPost(`/production-orders/${po.id}/qc/fail`, { notes: "Surface finish not acceptable" });
    expect(failed.body.productionOrder).toMatchObject({ status: "QC_FAILED", qc: { status: "FAILED", notes: "Surface finish not acceptable" } });
    const log = await AuditLogModel.findOne({ action: "manufacturing.qc_failed" }).lean();
    expect(log!.metadata).toMatchObject({ notes: "Surface finish not acceptable" });

    const reworked = await staffPost(`/production-orders/${po.id}/rework`);
    expect(reworked.body.productionOrder.status).toBe("IN_PROGRESS");
    const resubmit = await staffPost(`/production-orders/${po.id}/submit-qc`, { actualGrossWeight: 485, actualWastage: 10, labourCost: 1000 });
    const pass = await staffPost(`/production-orders/${resubmit.body.productionOrder.id}/qc/pass`);
    expect(pass.body.productionOrder.status).toBe("QC_PASSED");
  });

  it("cancellation returns whatever was issued and not yet consumed to stock, ledgered", async () => {
    const batch = await rawGoldBatch(500);
    const po = await issuedPO([batch.id]);
    const cancelled = await staffPost(`/production-orders/${po.id}/cancel`, { reason: "Design changed" });
    expect(cancelled.status, JSON.stringify(cancelled.body)).toBe(200);
    expect(cancelled.body.productionOrder.status).toBe("CANCELLED");
    const item = await InventoryItemModel.findById(batch.id).lean();
    expect(item!.status).toBe("AVAILABLE");
    expect(await InventoryLedgerModel.countDocuments({ itemId: batch.id })).toBe(3); // receipt, issue, cancellation-return
    const log = await AuditLogModel.findOne({ action: "manufacturing.cancelled" }).lean();
    expect(log!.metadata).toMatchObject({ reason: "Design changed" });
  });

  describe("material reconciliation — the five figures, and discrepancies clearly flagged", () => {
    it("a discrepancy beyond tolerance is refused without a note, and flagged with one", async () => {
      const batch = await rawGoldBatch(500);
      const po = await qcPassedFlow(batch.id);
      const blocked = await staffPost(`/production-orders/${po.id}/complete`, { finishedPieces: [{ grossWeight: 400, quantity: 1 }], returnedItemIds: [], wastage: 10 }); // 500 - 400 - 10 = 90 g missing
      expect(blocked.status).toBe(400);
      expect(blocked.body.error.message).toMatch(/discrepancy/i);
      expect(await InventoryItemModel.countDocuments({ type: "FINISHED_JEWELLERY" })).toBe(0);

      const withNote = await staffPost(`/production-orders/${po.id}/complete`, { finishedPieces: [{ grossWeight: 400, quantity: 1 }], returnedItemIds: [], wastage: 10, discrepancyNote: "90 g missing — investigating with the karigar" });
      expect(withNote.status, JSON.stringify(withNote.body)).toBe(200);
      expect(withNote.body.productionOrder.reconciliation).toMatchObject({ discrepancyGrossWeight: 90, hasDiscrepancy: true, discrepancyNote: expect.stringContaining("investigating") });
    });

    it("unused issued material returned whole is credited back in the reconciliation and to stock", async () => {
      const big = await rawGoldBatch(300);
      const small = await rawGoldBatch(200);
      let po = await issuedPO([big.id, small.id]);
      expect(po.issuedGrossWeight).toBe(500);
      po = (await staffPost(`/production-orders/${po.id}/start`)).body.productionOrder;
      po = (await staffPost(`/production-orders/${po.id}/submit-qc`, { actualGrossWeight: 290, actualWastage: 10, labourCost: 0 })).body.productionOrder;
      po = (await staffPost(`/production-orders/${po.id}/qc/pass`)).body.productionOrder;
      // only the 300 g batch is used; the 200 g batch is returned untouched
      const completed = await staffPost(`/production-orders/${po.id}/complete`, { finishedPieces: [{ grossWeight: 290, quantity: 1 }], returnedItemIds: [small.id], wastage: 10 });
      expect(completed.status, JSON.stringify(completed.body)).toBe(200);
      expect(completed.body.productionOrder.reconciliation).toMatchObject({ issuedGrossWeight: 500, returnedGrossWeight: 200, finishedGrossWeight: 290, wastageGrossWeight: 10, discrepancyGrossWeight: 0, hasDiscrepancy: false });
      const returned = await InventoryItemModel.findById(small.id).lean();
      expect(returned).toMatchObject({ status: "AVAILABLE", grossWeight: 200 });
      expect(String(returned!.locationId)).toBe(w.loc.warehouse); // back to where it was received from, not into the manufacturing unit
    });

    it("the reconciliation screen lists every issued order and clearly flags discrepancies", async () => {
      const clean = await rawGoldBatch(500);
      const cleanPo = await qcPassedFlow(clean.id);
      await staffPost(`/production-orders/${cleanPo.id}/complete`, { finishedPieces: [{ grossWeight: 480, quantity: 1 }], returnedItemIds: [], wastage: 20 });

      const bad = await rawGoldBatch(500);
      const badPo = await qcPassedFlow(bad.id);
      await staffPost(`/production-orders/${badPo.id}/complete`, { finishedPieces: [{ grossWeight: 400, quantity: 1 }], returnedItemIds: [], wastage: 10, discrepancyNote: "short" });

      const all = await staff("/reconciliation");
      expect(all.body.items.length).toBeGreaterThanOrEqual(2);
      const badRow = all.body.items.find((r: { id: string }) => r.id === badPo.id);
      expect(badRow).toMatchObject({ kind: "PRODUCTION", hasDiscrepancy: true, discrepancyGrossWeight: 90 });
      // discrepancies sort first
      expect(all.body.items[0].hasDiscrepancy).toBe(true);

      const onlyDiscrepancies = await staff("/reconciliation?discrepancyOnly=true");
      expect(onlyDiscrepancies.body.items.every((r: { hasDiscrepancy: boolean }) => r.hasDiscrepancy)).toBe(true);
      expect(onlyDiscrepancies.body.items.some((r: { id: string }) => r.id === cleanPo.id)).toBe(false);
    });
  });
});

async function qcPassedFlow(itemId: string): Promise<ProductionOrder> {
  let po = await issuedPO([itemId]);
  po = (await staffPost(`/production-orders/${po.id}/start`)).body.productionOrder;
  po = (await staffPost(`/production-orders/${po.id}/submit-qc`, { actualGrossWeight: 490, actualWastage: 10, labourCost: 0 })).body.productionOrder;
  po = (await staffPost(`/production-orders/${po.id}/qc/pass`)).body.productionOrder;
  return po;
}

describe("job work — issue to a vendor, and return: finished goods, unused material, wastage, discrepancy", () => {
  it("issuing moves material to the job worker through the ledger", async () => {
    const batch = await rawGoldBatch(500);
    const jw = await createJW();
    expect(jw.jobWorkOrderNo).toMatch(/^JW-\d{6}$/);
    const issued = await staffPost(`/job-work-orders/${jw.id}/issue`, { itemIds: [batch.id] });
    expect(issued.status, JSON.stringify(issued.body)).toBe(200);
    expect(issued.body.jobWorkOrder).toMatchObject({ status: "ISSUED", issuedGrossWeight: 500 });
    const item = await InventoryItemModel.findById(batch.id).lean();
    expect(item!.status).toBe("WITH_JOB_WORKER");
    expect(await InventoryLedgerModel.countDocuments({ itemId: batch.id, movementType: "JOBWORK_ISSUE" })).toBe(1);
  });

  it("supports a partial return (some finished, more to come) before a final close", async () => {
    const batch = await rawGoldBatch(500);
    const jw = await issuedJW([batch.id]);

    const partial = await staffPost(`/job-work-orders/${jw.id}/return`, { finishedPieces: [{ grossWeight: 200, quantity: 1 }], wastage: 5 });
    expect(partial.status, JSON.stringify(partial.body)).toBe(200);
    expect(partial.body.jobWorkOrder.status).toBe("PARTIALLY_RETURNED");
    expect(partial.body.jobWorkOrder.reconciliation).toMatchObject({ finishedGrossWeight: 200, wastageGrossWeight: 5, returnedGrossWeight: 0 });
    // not a discrepancy yet — more is still expected
    expect(partial.body.jobWorkOrder.reconciliation.hasDiscrepancy).toBe(false);

    const final = await staffPost(`/job-work-orders/${jw.id}/return`, { finishedPieces: [{ grossWeight: 285, quantity: 1 }], wastage: 10, final: true });
    expect(final.status, JSON.stringify(final.body)).toBe(200);
    expect(final.body.jobWorkOrder.status).toBe("RETURNED");
    expect(final.body.jobWorkOrder.reconciliation).toMatchObject({ issuedGrossWeight: 500, finishedGrossWeight: 485, wastageGrossWeight: 15, returnedGrossWeight: 0, discrepancyGrossWeight: 0, hasDiscrepancy: false });
    expect(await InventoryItemModel.countDocuments({ type: "FINISHED_JEWELLERY" })).toBe(2);
    const log = await AuditLogModel.findOne({ action: "manufacturing.job_work_returned", "metadata.final": true }).lean();
    expect(log).toBeTruthy();
  });

  it("a discrepancy on the closing return is refused without a note", async () => {
    const batch = await rawGoldBatch(500);
    const jw = await issuedJW([batch.id]);
    const blocked = await staffPost(`/job-work-orders/${jw.id}/return`, { finishedPieces: [{ grossWeight: 400, quantity: 1 }], wastage: 10, final: true });
    expect(blocked.status).toBe(400);
    const withNote = await staffPost(`/job-work-orders/${jw.id}/return`, { finishedPieces: [{ grossWeight: 400, quantity: 1 }], wastage: 10, final: true, discrepancyNote: "90 g short — raised with the vendor" });
    expect(withNote.status, JSON.stringify(withNote.body)).toBe(200);
    expect(withNote.body.jobWorkOrder.reconciliation).toMatchObject({ hasDiscrepancy: true, discrepancyGrossWeight: 90 });
  });

  it("won't return an item that wasn't issued, or return the same item twice", async () => {
    const batch = await rawGoldBatch(500);
    const other = await rawGoldBatch(100);
    const jw = await issuedJW([batch.id]);
    expect((await staffPost(`/job-work-orders/${jw.id}/return`, { returnedItemIds: [other.id] })).status).toBe(400);
    await staffPost(`/job-work-orders/${jw.id}/return`, { returnedItemIds: [batch.id] });
    expect((await staffPost(`/job-work-orders/${jw.id}/return`, { returnedItemIds: [batch.id] })).status).toBe(409);
  });

  it("can only issue a DRAFT order, and cancel only before issue", async () => {
    const jw = await createJW();
    const cancelled = await staffPost(`/job-work-orders/${jw.id}/cancel`, { reason: "Not needed" });
    expect(cancelled.status).toBe(200);
    const batch = await rawGoldBatch(500);
    expect((await staffPost(`/job-work-orders/${cancelled.body.jobWorkOrder.id}/issue`, { itemIds: [batch.id] })).status).toBe(409);
  });
});

describe("manufacturing dashboard", () => {
  it("counts orders by stage", async () => {
    await createPO();
    const batch = await rawGoldBatch(500);
    await issuedJW([batch.id]);
    const dash = await staff("/dashboard");
    expect(dash.body.counts.draftProductionOrders).toBeGreaterThanOrEqual(1);
    expect(dash.body.counts.issuedJobWork).toBeGreaterThanOrEqual(1);
  });
});
