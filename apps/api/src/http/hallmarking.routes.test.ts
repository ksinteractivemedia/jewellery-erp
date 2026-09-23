import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import type { AssayingCentre, HallmarkingBatch } from "@jewellery/types";
import { buildTestApp, createStaff, loginAs, seedRbac, bearer } from "../../test/helpers";
import { type World, makeWorld, receive } from "../../test/inventory-fixtures";
import { AuditLogModel } from "../modules/audit/audit-log.model";
import { InventoryItemModel } from "../modules/inventory/inventory-item.model";
import { InventoryLedgerModel } from "../modules/inventory/inventory-ledger.model";

let t: ReturnType<typeof buildTestApp>;
let w: World;
let centre: AssayingCentre;
const tokens: Record<string, string> = {};

const staff = (path: string, who = "manager") => request(t.app).get(`/api/hallmarking${path}`).set(bearer(tokens[who]!));
const staffPost = (path: string, body: object = {}, who = "manager") => request(t.app).post(`/api/hallmarking${path}`).set(bearer(tokens[who]!)).send(body);

async function tokenFor(email: string) {
  const { accessToken, res } = await loginAs(t.app, email);
  if (!accessToken) throw new Error(`sign-in failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  return accessToken;
}

async function createBatch(itemIds: string[], over: Record<string, unknown> = {}) {
  const res = await staffPost("/batches", { assayingCentreId: centre.id, itemIds, ...over });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body.batch as HallmarkingBatch;
}
async function dispatchedBatch(itemIds: string[]) {
  const batch = await createBatch(itemIds);
  const res = await staffPost(`/batches/${batch.id}/dispatch`);
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body.batch as HallmarkingBatch;
}

beforeEach(async () => {
  t = buildTestApp();
  await seedRbac();
  w = await makeWorld();

  const centreRes = await (async () => {
    tokens.manager = await tokenFor((await createStaff("INVENTORY_MANAGER")).email);
    const res = await staffPost("/centres", { name: "Suvarna Assaying & Hallmarking Pvt Ltd", code: "SAH01", bisRegistrationNumber: "BIS/MH/00123", locationId: w.loc.hallmark });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    return res.body.centre as AssayingCentre;
  })();
  centre = centreRes;

  tokens.viewer = await tokenFor((await createStaff("VIEWER")).email);
  tokens.sales = await tokenFor((await createStaff("SALES_EXECUTIVE")).email);
});

describe("who can reach what", () => {
  it("needs a login", async () => {
    expect((await request(t.app).get("/api/hallmarking/dashboard")).status).toBe(401);
  });
  it("view is open to inventory.view; writes need inventory.create", async () => {
    expect((await staff("/batches", "viewer")).status).toBe(200);
    expect((await staffPost("/batches", {}, "viewer")).status).toBe(403);
    expect((await staffPost("/batches", {}, "sales")).status).toBe(403);
  });
});

describe("assaying centres — configuration data, never hardcoded", () => {
  it("must reference a real HALLMARKING_CENTER location, not just any location", async () => {
    const res = await staffPost("/centres", { name: "Bad Centre", code: "BAD01", locationId: w.loc.counter });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/hallmarking centre/i);
  });
  it("lists and updates", async () => {
    expect((await staff("/centres")).body.items.map((c: AssayingCentre) => c.code)).toContain("SAH01");
    const patch = await request(t.app).patch(`/api/hallmarking/centres/${centre.id}`).set(bearer(tokens.manager!)).send({ isActive: false });
    expect(patch.status, JSON.stringify(patch.body)).toBe(200);
    expect(patch.body.centre.isActive).toBe(false);
  });
});

describe("the full flow: Inventory Item -> Send to Hallmarking -> In Transit -> At Hallmarking Centre -> Received -> Verified/Failed", () => {
  it("dispatching moves the real item through the ledger — never just a quantity update", async () => {
    const item = await receive(w, { locationId: w.loc.counter });
    const batch = await createBatch([item.id]);
    expect(batch.hallmarkingNo).toMatch(/^HM-\d{6}$/);
    expect(batch.status).toBe("PENDING");
    expect(batch.lines[0]).toMatchObject({ itemCode: item.itemCode, purity: item.purity, effectiveStatus: "PENDING" });
    // nothing has moved yet
    expect((await InventoryItemModel.findById(item.id).lean())!.status).toBe("AVAILABLE");

    const dispatched = await staffPost(`/batches/${batch.id}/dispatch`);
    expect(dispatched.status, JSON.stringify(dispatched.body)).toBe(200);
    expect(dispatched.body.batch).toMatchObject({ status: "IN_TRANSIT" });
    expect(dispatched.body.batch.sentDate).toBeTruthy();
    const moved = await InventoryItemModel.findById(item.id).lean();
    expect(moved!.status).toBe("HALLMARKING");
    expect(String(moved!.locationId)).toBe(w.loc.hallmark);
    const ledger = await InventoryLedgerModel.find({ itemId: item.id }).lean();
    expect(ledger).toHaveLength(2); // #1 original receipt, #2 HALLMARKING_OUT
    expect(ledger[1]).toMatchObject({ movementType: "HALLMARKING_OUT", fromStatus: "AVAILABLE", toStatus: "HALLMARKING" });
    const auditLog = await AuditLogModel.findOne({ action: "hallmarking.dispatched" }).lean();
    expect(auditLog!.metadata).toMatchObject({ hallmarkingNo: batch.hallmarkingNo, centre: centre.name, items: 1 });

    const arrived = await staffPost(`/batches/${dispatched.body.batch.id}/arrive`, { notes: "Handed over at the counter" });
    expect(arrived.body.batch.status).toBe("AT_CENTRE");
    // arriving is a pure logistics update — no further ledger entry
    expect(await InventoryLedgerModel.countDocuments({ itemId: item.id })).toBe(2);

    const received = await staffPost(`/batches/${arrived.body.batch.id}/receive`, { lines: [{ itemId: item.id, huid: "ab12cd", certificateNumber: "CERT-9001", hallmarkDate: "2026-01-05" }] });
    expect(received.status, JSON.stringify(received.body)).toBe(200);
    expect(received.body.batch.status).toBe("RECEIVED");
    expect(received.body.batch.lines[0]).toMatchObject({ huid: "AB12CD", certificateNumber: "CERT-9001", hallmarkDate: "2026-01-05", effectiveStatus: "RECEIVED" });
    const back = await InventoryItemModel.findById(item.id).lean();
    expect(back).toMatchObject({ status: "AVAILABLE", huid: "AB12CD", hallmarkStatus: "HALLMARKED" });
    expect(String(back!.locationId)).toBe(w.loc.counter); // back to where it came FROM, not the centre
    expect(await InventoryLedgerModel.countDocuments({ itemId: item.id, movementType: "HALLMARKING_IN" })).toBe(1);

    const verified = await staffPost(`/batches/${received.body.batch.id}/lines/${item.id}/verify`, { notes: "Matches the certificate" });
    expect(verified.status, JSON.stringify(verified.body)).toBe(200);
    expect(verified.body.batch.lines[0]).toMatchObject({ outcome: "VERIFIED", effectiveStatus: "VERIFIED" });
    const log = await AuditLogModel.findOne({ action: "hallmarking.verified" }).lean();
    expect(log!.metadata).toMatchObject({ huid: "AB12CD" });
  });

  it("a piece can fail — either because the centre sent it back unmarked, or our own check rejects it", async () => {
    const item = await receive(w, { locationId: w.loc.counter });
    const batch = await dispatchedBatch([item.id]);
    const received = await staffPost(`/batches/${batch.id}/receive`, { lines: [{ itemId: item.id }] }); // no HUID — rejected by the centre
    expect(received.body.batch.lines[0].huid).toBeUndefined();
    const backItem = await InventoryItemModel.findById(item.id).lean();
    expect(backItem!.hallmarkStatus).toBe("PENDING"); // never marked, so still pending — not silently upgraded

    const failed = await staffPost(`/batches/${received.body.batch.id}/lines/${item.id}/fail`, { failureReason: "Returned unmarked — surface defect noted by the centre" });
    expect(failed.status, JSON.stringify(failed.body)).toBe(200);
    expect(failed.body.batch.lines[0]).toMatchObject({ outcome: "FAILED", effectiveStatus: "FAILED", failureReason: expect.stringContaining("defect") });
    const log = await AuditLogModel.findOne({ action: "hallmarking.failed" }).lean();
    expect(log!.metadata).toMatchObject({ failureReason: expect.stringContaining("defect") });
  });

  it("a line can only be decided once, and only once the batch is back", async () => {
    const item = await receive(w, { locationId: w.loc.counter });
    const batch = await createBatch([item.id]);
    expect((await staffPost(`/batches/${batch.id}/lines/${item.id}/verify`)).status).toBe(409); // still PENDING, nothing to verify
    const dispatched = await staffPost(`/batches/${batch.id}/dispatch`);
    const received = await staffPost(`/batches/${dispatched.body.batch.id}/receive`, { lines: [{ itemId: item.id, huid: "ZZ9988" }] });
    await staffPost(`/batches/${received.body.batch.id}/lines/${item.id}/verify`);
    expect((await staffPost(`/batches/${received.body.batch.id}/lines/${item.id}/verify`)).status).toBe(409); // already decided
    expect((await staffPost(`/batches/${received.body.batch.id}/lines/${item.id}/fail`, { failureReason: "too late" })).status).toBe(409);
  });

  it("cancellation is only possible before dispatch — nothing has moved yet, so nothing to reverse", async () => {
    const item = await receive(w, { locationId: w.loc.counter });
    const batch = await createBatch([item.id]);
    const cancelled = await staffPost(`/batches/${batch.id}/cancel`, { reason: "Wrong centre chosen" });
    expect(cancelled.status, JSON.stringify(cancelled.body)).toBe(200);
    expect(cancelled.body.batch.status).toBe("CANCELLED");
    expect((await InventoryItemModel.findById(item.id).lean())!.status).toBe("AVAILABLE");

    const dispatched = await dispatchedBatch([await receive(w, { locationId: w.loc.counter }).then((i) => i.id)]);
    expect((await staffPost(`/batches/${dispatched.id}/cancel`, { reason: "too late" })).status).toBe(409);
  });

  it("a receipt must account for every piece on the batch — never leaving one stranded in HALLMARKING status", async () => {
    const a = await receive(w, { locationId: w.loc.counter });
    const b = await receive(w, { locationId: w.loc.store2 });
    const batch = await dispatchedBatch([a.id, b.id]);
    const partial = await staffPost(`/batches/${batch.id}/receive`, { lines: [{ itemId: a.id, huid: "PART01" }] }); // b left off
    expect(partial.status, JSON.stringify(partial.body)).toBe(409);
    expect(partial.body.error.message).toMatch(new RegExp(b.itemCode));
    // nothing moved — not even the item that WAS named
    expect((await InventoryItemModel.findById(a.id).lean())!.status).toBe("HALLMARKING");
    expect((await InventoryItemModel.findById(b.id).lean())!.status).toBe("HALLMARKING");

    const full = await staffPost(`/batches/${batch.id}/receive`, { lines: [{ itemId: a.id, huid: "PART01" }, { itemId: b.id }] });
    expect(full.status, JSON.stringify(full.body)).toBe(200);
    expect((await InventoryItemModel.findById(a.id).lean())!.status).toBe("AVAILABLE");
    expect((await InventoryItemModel.findById(b.id).lean())!.status).toBe("AVAILABLE");
  });

  it("won't send an item that isn't AVAILABLE", async () => {
    const item = await receive(w, { locationId: w.loc.counter });
    await dispatchedBatch([item.id]); // now HALLMARKING, not AVAILABLE
    const again = await staffPost("/batches", { assayingCentreId: centre.id, itemIds: [item.id] });
    expect(again.status).toBe(409);
  });
});

describe("the HUID is unique where applicable", () => {
  it("refuses receiving a second, different item with a HUID already assigned to another", async () => {
    const first = await receive(w, { locationId: w.loc.counter });
    const b1 = await dispatchedBatch([first.id]);
    await staffPost(`/batches/${b1.id}/receive`, { lines: [{ itemId: first.id, huid: "AAAA11" }] });

    const second = await receive(w, { locationId: w.loc.counter });
    const b2 = await dispatchedBatch([second.id]);
    const clash = await staffPost(`/batches/${b2.id}/receive`, { lines: [{ itemId: second.id, huid: "AAAA11" }] });
    expect(clash.status).toBe(409);
    expect(clash.body.error.code).toBe("DUPLICATE_IDENTIFIER");
    // the second item never got the ledger move committed with a clashing HUID
    expect((await InventoryItemModel.findById(second.id).lean())!.huid).toBeUndefined();
  });

  it("HUIDs are stored uppercase, so a lowercase and uppercase entry collide as the same mark", async () => {
    const item = await receive(w, { locationId: w.loc.counter });
    const batch = await dispatchedBatch([item.id]);
    const received = await staffPost(`/batches/${batch.id}/receive`, { lines: [{ itemId: item.id, huid: "bb22cc" }] });
    expect(received.body.batch.lines[0].huid).toBe("BB22CC");
  });
});

describe("an item's own hallmarking history — for the Inventory Item Detail screen", () => {
  it("lists every batch the piece has ever been part of, newest first, and nothing for an untouched piece", async () => {
    const untouched = await receive(w, { locationId: w.loc.counter });
    expect((await staff(`/items/${untouched.id}/history`)).body.items).toEqual([]);

    const item = await receive(w, { locationId: w.loc.counter });
    const b1 = await dispatchedBatch([item.id]);
    await staffPost(`/batches/${b1.id}/receive`, { lines: [{ itemId: item.id, huid: "HI5511" }] });
    // sent again later — a second, independent trip
    const b2 = await createBatch([item.id]);

    const history = await staff(`/items/${item.id}/history`);
    expect(history.status, JSON.stringify(history.body)).toBe(200);
    expect(history.body.items.map((b: HallmarkingBatch) => b.hallmarkingNo)).toEqual([b2.hallmarkingNo, b1.hallmarkingNo]); // newest first
    expect(history.body.items[1].lines[0]).toMatchObject({ huid: "HI5511", effectiveStatus: "RECEIVED" });
  });
});

describe("hallmarking dashboard", () => {
  it("counts pieces by their effective status — a batch's own stage until a piece has its own outcome", async () => {
    const pending = await receive(w, { locationId: w.loc.counter });
    await createBatch([pending.id]);
    const transit = await receive(w, { locationId: w.loc.counter });
    await dispatchedBatch([transit.id]);
    const verified = await receive(w, { locationId: w.loc.counter });
    const vb = await dispatchedBatch([verified.id]);
    const vr = await staffPost(`/batches/${vb.id}/receive`, { lines: [{ itemId: verified.id, huid: "VVVV11" }] });
    await staffPost(`/batches/${vr.body.batch.id}/lines/${verified.id}/verify`);

    const dash = await staff("/dashboard");
    expect(dash.body.counts).toMatchObject({ pending: 1, inTransit: 1, verified: 1 });
  });
});
