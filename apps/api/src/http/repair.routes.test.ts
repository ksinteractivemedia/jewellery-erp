import { Types } from "mongoose";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import type { RepairOrder } from "@jewellery/types";
import { buildTestApp, createStaff, loginAs, seedRbac, bearer } from "../../test/helpers";
import { type World, makeWorld, receive, someUser } from "../../test/inventory-fixtures";
import { AuditLogModel } from "../modules/audit/audit-log.model";
import { InventoryItemModel } from "../modules/inventory/inventory-item.model";
import { InventoryLedgerModel } from "../modules/inventory/inventory-ledger.model";
import { sellItems } from "../modules/inventory/stock-operations";

let t: ReturnType<typeof buildTestApp>;
let w: World;
const tokens: Record<string, string> = {};

const staff = (path: string, who = "manager") => request(t.app).get(`/api/repair${path}`).set(bearer(tokens[who]!));
const staffPost = (path: string, body: object = {}, who = "manager") => request(t.app).post(`/api/repair${path}`).set(bearer(tokens[who]!)).send(body);

async function tokenFor(email: string) {
  const { accessToken, res } = await loginAs(t.app, email);
  if (!accessToken) throw new Error(`sign-in failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  return accessToken;
}

const customer = { name: "Devika Nair", phone: "9123456780" };

/** A piece we already sold to this customer — the ordinary repair case. */
async function soldItem() {
  const item = await receive(w, { locationId: w.loc.counter });
  await sellItems({ performedBy: someUser(), channel: "B2C" }, { itemIds: [item.id], referenceType: "ORDER", referenceId: someOrderId() });
  return item;
}
const someOrderId = () => new Types.ObjectId().toString();

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
    expect((await request(t.app).get("/api/repair/dashboard")).status).toBe(401);
  });
  it("QC decisions need repair.approve, not just repair.create", async () => {
    const item = await soldItem();
    const intake = await staffPost("/", { customer, itemId: item.id, itemDescription: "Gold ring, loose stone", locationId: w.loc.repair }, "exec");
    expect(intake.status, JSON.stringify(intake.body)).toBe(201);
    await staffPost(`/${intake.body.repair.id}/inspect`, {}, "exec");
    await staffPost(`/${intake.body.repair.id}/estimate`, { labourCharge: 30000 }, "exec");
    await staffPost(`/${intake.body.repair.id}/estimate/decide`, { approved: true }, "exec");
    await staffPost(`/${intake.body.repair.id}/start`, {}, "exec");
    await staffPost(`/${intake.body.repair.id}/work`, { afterGrossWeight: item.grossWeight }, "exec");
    expect((await staffPost(`/${intake.body.repair.id}/qc/pass`, {}, "exec")).status).toBe(403);
    expect((await staffPost(`/${intake.body.repair.id}/qc/pass`, {}, "manager")).status).toBe(200);
  });
});

describe("intake against an existing (already sold) piece: REPAIR_OUT moves it into custody", () => {
  it("refuses intake against a piece that isn't currently sold", async () => {
    const item = await receive(w, { locationId: w.loc.counter }); // still AVAILABLE, never sold
    const res = await staffPost("/", { customer, itemId: item.id, itemDescription: "Gold ring", locationId: w.loc.repair });
    expect(res.status).toBe(409);
  });

  it("the full flow, with real ledger assertions at intake, work, and delivery", async () => {
    const item = await soldItem();
    const intake = await staffPost("/", { customer, itemId: item.id, itemDescription: "Gold ring, loose stone", stoneWork: "Re-set the ruby", dueDate: "2026-10-01", locationId: w.loc.repair });
    expect(intake.status, JSON.stringify(intake.body)).toBe(201);
    const ro: RepairOrder = intake.body.repair;
    expect(ro.repairNo).toMatch(/^REP-\d{6}$/);
    expect(ro.status).toBe("INTAKE");
    expect(ro.beforeWeight).toMatchObject({ grossWeight: item.grossWeight });
    const afterIntake = await InventoryItemModel.findById(item.id).lean();
    expect(afterIntake!.status).toBe("UNDER_REPAIR");
    expect(String(afterIntake!.locationId)).toBe(w.loc.repair);
    const ledger1 = await InventoryLedgerModel.find({ itemId: item.id }).sort({ sequence: 1 }).lean();
    expect(ledger1.map((l) => l.movementType)).toEqual(["PURCHASE_RECEIPT", "SALE", "REPAIR_OUT"]);
    const intakeLog = await AuditLogModel.findOne({ action: "repair.intaken" }).lean();
    expect(intakeLog!.metadata).toMatchObject({ repairNo: ro.repairNo, customerOwned: false });

    const inspected = await staffPost(`/${ro.id}/inspect`, { inspectionNotes: "Prong worn, stone loose" });
    expect(inspected.body.repair.status).toBe("INSPECTED");

    const estimated = await staffPost(`/${ro.id}/estimate`, { labourCharge: 50000, materialsCharge: 10000, notes: "New prong + re-set" });
    expect(estimated.status, JSON.stringify(estimated.body)).toBe(200);
    expect(estimated.body.repair.estimate).toMatchObject({ labourCharge: 50000, materialsCharge: 10000, total: 60000 });

    const approved = await staffPost(`/${ro.id}/estimate/decide`, { approved: true, byName: "Devika (phone)" });
    expect(approved.body.repair.status).toBe("APPROVED");
    expect(approved.body.repair.approval).toMatchObject({ approved: true });

    const started = await staffPost(`/${ro.id}/start`);
    expect(started.body.repair.status).toBe("IN_PROGRESS");

    const worked = await staffPost(`/${ro.id}/work`, { afterGrossWeight: item.grossWeight + 0.2, afterStoneWeight: 0, stoneWork: "Ruby re-set, new prong soldered" });
    expect(worked.status, JSON.stringify(worked.body)).toBe(200);
    expect(worked.body.repair.status).toBe("QC_PENDING");
    expect(worked.body.repair.afterWeight).toMatchObject({ grossWeight: item.grossWeight + 0.2 });
    expect(worked.body.repair.finalCharges).toMatchObject({ total: 60000 }); // defaulted from the approved estimate

    const failed = await staffPost(`/${ro.id}/qc/fail`, { notes: "Prong still loose" });
    expect(failed.body.repair.status).toBe("QC_FAILED");
    const reworked = await staffPost(`/${ro.id}/rework`, { reason: "Re-solder" });
    expect(reworked.body.repair.status).toBe("IN_PROGRESS");
    await staffPost(`/${ro.id}/work`, { afterGrossWeight: item.grossWeight + 0.2 });
    const passed = await staffPost(`/${ro.id}/qc/pass`, { notes: "Solid now" });
    expect(passed.body.repair.status).toBe("READY");

    const delivered = await staffPost(`/${ro.id}/deliver`, { note: "Handed to customer" });
    expect(delivered.status, JSON.stringify(delivered.body)).toBe(200);
    expect(delivered.body.repair.status).toBe("DELIVERED");
    const afterDeliver = await InventoryItemModel.findById(item.id).lean();
    // our own previously-sold piece goes back to SOLD — never onto sellable AVAILABLE stock
    expect(afterDeliver!.status).toBe("SOLD");
    const ledger2 = await InventoryLedgerModel.find({ itemId: item.id }).sort({ sequence: 1 }).lean();
    expect(ledger2.at(-1)).toMatchObject({ movementType: "REPAIR_RETURN", fromStatus: "UNDER_REPAIR", toStatus: "SOLD" });
    const deliveredLog = await AuditLogModel.findOne({ action: "repair.delivered" }).lean();
    expect(deliveredLog!.metadata).toMatchObject({ repairNo: ro.repairNo });
  });
});

describe("intake for a customer-owned piece we've never held: REPAIR_INTAKE creates it fresh", () => {
  it("creates a new, isCustomerOwned InventoryItem, and hands it back as RETURNED_TO_CUSTOMER — never SOLD, never AVAILABLE", async () => {
    const intake = await staffPost("/", {
      customer,
      itemDescription: "Antique gold necklace, family heirloom",
      metalId: w.gold,
      purity: "22K",
      grossWeight: 30,
      stoneWeight: 0,
      locationId: w.loc.repair,
    });
    expect(intake.status, JSON.stringify(intake.body)).toBe(201);
    const ro: RepairOrder = intake.body.repair;
    expect(ro.itemCode).toBeTruthy();
    const item = await InventoryItemModel.findById(ro.itemId).lean();
    expect(item).toMatchObject({ status: "UNDER_REPAIR", isCustomerOwned: true, cost: 0 });
    const ledger = await InventoryLedgerModel.find({ itemId: ro.itemId }).lean();
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({ movementType: "REPAIR_INTAKE", toStatus: "UNDER_REPAIR" });

    await staffPost(`/${ro.id}/inspect`, {});
    await staffPost(`/${ro.id}/estimate`, { labourCharge: 20000 });
    await staffPost(`/${ro.id}/estimate/decide`, { approved: true });
    await staffPost(`/${ro.id}/start`, {});
    await staffPost(`/${ro.id}/work`, { afterGrossWeight: 30 });
    await staffPost(`/${ro.id}/qc/pass`, {});
    const delivered = await staffPost(`/${ro.id}/deliver`, {});
    expect(delivered.status, JSON.stringify(delivered.body)).toBe(200);
    const finalItem = await InventoryItemModel.findById(ro.itemId).lean();
    expect(finalItem!.status).toBe("RETURNED_TO_CUSTOMER");
  });
});

describe("declining the estimate hands the piece straight back, unrepaired", () => {
  it("moves UNDER_REPAIR -> SOLD immediately on decline, without ever starting work", async () => {
    const item = await soldItem();
    const intake = await staffPost("/", { customer, itemId: item.id, itemDescription: "Gold chain", locationId: w.loc.repair });
    const ro: RepairOrder = intake.body.repair;
    await staffPost(`/${ro.id}/inspect`, {});
    await staffPost(`/${ro.id}/estimate`, { labourCharge: 80000 });
    const declined = await staffPost(`/${ro.id}/estimate/decide`, { approved: false, note: "Too expensive" });
    expect(declined.status, JSON.stringify(declined.body)).toBe(200);
    expect(declined.body.repair.status).toBe("DECLINED");
    const afterDecline = await InventoryItemModel.findById(item.id).lean();
    expect(afterDecline!.status).toBe("SOLD");
    expect((await InventoryLedgerModel.find({ itemId: item.id }).lean()).at(-1)).toMatchObject({ movementType: "REPAIR_RETURN" });
  });
});

describe("cancellation hands the piece back from any working stage, but never from READY or a terminal one", () => {
  it("cancel from IN_PROGRESS still returns the piece", async () => {
    const item = await soldItem();
    const intake = await staffPost("/", { customer, itemId: item.id, itemDescription: "Gold chain", locationId: w.loc.repair });
    const ro: RepairOrder = intake.body.repair;
    await staffPost(`/${ro.id}/inspect`, {});
    await staffPost(`/${ro.id}/estimate`, { labourCharge: 10000 });
    await staffPost(`/${ro.id}/estimate/decide`, { approved: true });
    await staffPost(`/${ro.id}/start`, {});
    const cancelled = await staffPost(`/${ro.id}/cancel`, { reason: "Customer wants it back as-is" });
    expect(cancelled.status, JSON.stringify(cancelled.body)).toBe(200);
    expect(cancelled.body.repair.status).toBe("CANCELLED");
    expect((await InventoryItemModel.findById(item.id).lean())!.status).toBe("SOLD");
  });

  it("cannot cancel a READY or DELIVERED repair", async () => {
    const item = await soldItem();
    const intake = await staffPost("/", { customer, itemId: item.id, itemDescription: "Gold chain", locationId: w.loc.repair });
    const ro: RepairOrder = intake.body.repair;
    await staffPost(`/${ro.id}/inspect`, {});
    await staffPost(`/${ro.id}/estimate`, { labourCharge: 10000 });
    await staffPost(`/${ro.id}/estimate/decide`, { approved: true });
    await staffPost(`/${ro.id}/start`, {});
    await staffPost(`/${ro.id}/work`, { afterGrossWeight: item.grossWeight });
    await staffPost(`/${ro.id}/qc/pass`, {});
    expect((await staffPost(`/${ro.id}/cancel`, { reason: "too late" })).status).toBe(409);
    await staffPost(`/${ro.id}/deliver`, {});
    expect((await staffPost(`/${ro.id}/cancel`, { reason: "too late" })).status).toBe(409);
  });
});

describe("repair dashboard", () => {
  it("counts orders by status", async () => {
    const item = await soldItem();
    await staffPost("/", { customer, itemId: item.id, itemDescription: "Gold chain", locationId: w.loc.repair });
    const dash = await staff("/dashboard");
    expect(dash.status, JSON.stringify(dash.body)).toBe(200);
    expect(dash.body.counts.INTAKE).toBe(1);
  });
});
