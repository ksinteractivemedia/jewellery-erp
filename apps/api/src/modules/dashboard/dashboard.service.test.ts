import { beforeEach, describe, expect, it } from "vitest";
import { Types } from "mongoose";
import { DomainValidationError, NotFoundError } from "../../shared/errors";
import { type World, makeWorld, receive, someOrder, someUser } from "../../../test/inventory-fixtures";
import { approveAdjustment, createTransfer, movePartner, requestAdjustment, reserveItems, returnItems, sellItems } from "../inventory/stock-operations";
import { createMetalRate } from "../metals/metal-rate.repository";
import { BranchModel } from "../organization/branch.model";
import { createBranch } from "../organization/branch.repository";
import { createLocation } from "../organization/location.repository";
import { createDashboardService } from "./dashboard.service";
import { ATTENTION_THRESHOLDS } from "./operations-dashboard";

const DAY = 86_400_000;
const ctx = () => ({ performedBy: someUser() });
let w: World;

const ok = <T>(section: { status: string; data?: T }): T => {
  expect(section.status).toBe("OK");
  return (section as { data: T }).data;
};

/** A small, known shop: five owned pieces, one sold piece that must NOT count, one silver bar, one piece at a job worker. */
async function stockWorld() {
  const g1 = await receive(w, { grossWeight: 10 }); // gold 22K, counter, ₹50,000
  const g2 = await receive(w, { grossWeight: 5, purity: "18K", cost: 2_000_000 }); // gold 18K, counter
  const s1 = await receive(w, { grossWeight: 100, metalId: w.silver, purity: "925", locationId: w.loc.warehouse, cost: 800_000 });
  const g3 = await receive(w, { grossWeight: 8, locationId: w.loc.store2 });
  const g4 = await receive(w, { grossWeight: 6 }); // sold below
  const g5 = await receive(w, { grossWeight: 4 });
  await reserveItems(ctx(), { itemIds: [g3.id], referenceId: someOrder() });
  await sellItems(ctx(), { itemIds: [g4.id], referenceType: "ORDER", referenceId: someOrder() });
  await movePartner(ctx(), { type: "JOBWORK_ISSUE", itemIds: [g5.id], destinationLocationId: w.loc.jobworker });
  await createMetalRate({ metalId: w.gold, purity: "22K", ratePerGram: 650_000, effectiveFrom: new Date("2026-01-01"), source: "MANUAL" });
  return { g1, g2, s1, g3, g4, g5 };
}

beforeEach(async () => {
  w = await makeWorld();
});

describe("inventory section — real stock, read live", () => {
  it("counts owned stock only: a sold piece is not stock", async () => {
    await stockWorld();
    const inv = ok(await createDashboardService().inventory({}));
    expect(inv.byLocation.reduce((n, r) => n + r.pieces, 0)).toBe(5); // g1 g2 s1 g3 g5 — not the sold g4
  });

  it("rolls stock up by metal, with weights and cost", async () => {
    await stockWorld();
    const inv = ok(await createDashboardService().inventory({}));
    const gold = inv.metals.find((m) => m.code === "GOLD")!;
    expect(gold).toMatchObject({ label: "Gold", pieces: 4, netWeight: 27, fineWeight: 23.902, cost: 17_000_000 }); // 10+5+8+4 g; 9.16+3.75+7.328+3.664
    const silver = inv.metals.find((m) => m.code === "SILVER")!;
    expect(silver).toMatchObject({ label: "Silver", pieces: 1, netWeight: 100, fineWeight: 92.5, cost: 800_000 });
    expect(inv.byMetal.map((r) => r.label)).toEqual(["Silver", "Gold"]); // heaviest fine weight first
  });

  it("rolls stock up by purity and by location", async () => {
    await stockWorld();
    const inv = ok(await createDashboardService().inventory({}));
    expect(inv.byPurity.map((r) => [r.label, r.pieces, r.fineWeight])).toEqual([["Silver 925", 1, 92.5], ["Gold 22K", 3, 20.152], ["Gold 18K", 1, 3.75]]);
    const at = (name: string) => inv.byLocation.find((r) => r.label === name);
    expect(at("Counter")).toMatchObject({ pieces: 2, cost: 7_000_000, availablePieces: 2 });
    expect(at("Store2")).toMatchObject({ pieces: 1, availablePieces: 0 }); // reserved, so not sellable
    expect(at("Warehouse")).toMatchObject({ pieces: 1, availablePieces: 1 });
    expect(at("Jobworker")).toMatchObject({ pieces: 1, availablePieces: 0 }); // owned, but away
  });

  it("separates sellable pieces from reserved ones", async () => {
    await stockWorld();
    const inv = ok(await createDashboardService().inventory({}));
    expect(inv.availablePieces).toBe(3); // g1, g2, s1
    expect(inv.reserved).toEqual({ pieces: 1, fineWeight: 7.328 });
  });

  it("values stock at book cost and, where a rate is on file, at the metal rate — saying which metal it could not value", async () => {
    await stockWorld();
    const { stockValue } = ok(await createDashboardService().inventory({}));
    expect(stockValue.cost).toBe(17_800_000);
    // 22K: 22 g × ₹6,500 = ₹1,43,000.00; 18K has no quote so it is carried over from 22K by fineness: 3.75 g fine → ₹26,610.26
    expect(stockValue.metalValue).toBe(14_300_000 + 2_661_026);
    expect(stockValue.metalValueMissingFor).toEqual(["Silver"]); // no silver rate: excluded, and named
  });

  it("has no metal value at all — rather than zero — when no rate exists", async () => {
    await receive(w);
    const { stockValue } = ok(await createDashboardService().inventory({}));
    expect(stockValue.metalValue).toBeNull();
    expect(stockValue.metalValueMissingFor).toEqual(["Gold"]);
    expect(stockValue.cost).toBe(5_000_000);
  });

  it("reports an empty shop as zeros and empty lists", async () => {
    const inv = ok(await createDashboardService().inventory({}));
    expect(inv).toEqual({ metals: [], availablePieces: 0, reserved: { pieces: 0, fineWeight: 0 }, stockValue: { cost: 0, metalValue: 0, metalValueMissingFor: [] }, byLocation: [], byMetal: [], byPurity: [] });
  });

  it("is a live LIVE-provenance snapshot that ignores the date range", async () => {
    await stockWorld();
    const section = await createDashboardService().inventory({ from: "2020-01-01", to: "2020-01-31" });
    expect(section).toMatchObject({ status: "OK", provenance: "LIVE", scope: { honours: { dateRange: false, branch: true, location: true } } });
    expect(section.status === "OK" && section.scope.range).toBeUndefined();
    expect(ok(section).availablePieces).toBe(3);
  });
});

describe("branch and location filters", () => {
  async function secondBranch() {
    const branchId = w.branchId;
    const companyId = String((await BranchModel.findById(branchId).lean())!.companyId);
    const other = await createBranch({ companyId, name: "Pune Store", code: "PUNE", address: { line1: "2 FC Road", city: "Pune", state: "Maharashtra", postalCode: "411004", country: "India" } });
    const loc = await createLocation({ branchId: other.id, name: "Pune Counter", code: "PCTR", type: "COUNTER" });
    await receive(w, { locationId: loc.id, grossWeight: 3 });
    return { branch: other.id, location: loc.id };
  }

  it("narrows to one branch, one location, or the whole business", async () => {
    await stockWorld();
    const pune = await secondBranch();
    const dash = createDashboardService();
    const total = (s: Awaited<ReturnType<typeof dash.inventory>>) => ok(s).byLocation.reduce((n, r) => n + r.pieces, 0);
    expect(total(await dash.inventory({}))).toBe(6);
    expect(total(await dash.inventory({ branchId: w.branchId }))).toBe(5);
    expect(total(await dash.inventory({ branchId: pune.branch }))).toBe(1);
    expect(total(await dash.inventory({ locationId: w.loc.counter }))).toBe(2);
    expect(ok(await dash.inventory({ locationId: pune.location })).stockValue.cost).toBe(5_000_000);
  });

  it("applies the same scope to operations, alerts and activity", async () => {
    await stockWorld();
    const pune = await secondBranch();
    const dash = createDashboardService();
    expect(ok(await dash.operations({ branchId: w.branchId })).jobWork.pieces).toBe(1);
    expect(ok(await dash.operations({ branchId: pune.branch })).jobWork.pieces).toBe(0);
    expect(ok(await dash.activity({ branchId: pune.branch })).total).toBe(1); // only the Pune receipt
    expect(ok(await dash.activity({})).total).toBeGreaterThan(ok(await dash.activity({ branchId: pune.branch })).total);
  });

  it("refuses a location that is not in the named branch, and 404s an unknown one", async () => {
    const pune = await secondBranch();
    const dash = createDashboardService();
    await expect(dash.inventory({ branchId: w.branchId, locationId: pune.location })).rejects.toThrow(DomainValidationError);
    await expect(dash.inventory({ locationId: new Types.ObjectId().toString() })).rejects.toThrow(NotFoundError);
    await expect(dash.inventory({ branchId: new Types.ObjectId().toString() })).rejects.toThrow(NotFoundError);
  });

  it("lists branches with their locations for the filter bar", async () => {
    const meta = await createDashboardService({ now: () => new Date("2026-09-20T18:31:00Z") }).meta();
    expect(meta.today).toBe("2026-09-21"); // 00:01 IST — the business day, not the UTC date
    expect(meta.branches).toHaveLength(1);
    expect(meta.branches[0]!.locations.map((l) => l.name).sort()).toEqual(["Counter", "Hallmark", "Jobworker", "Repair", "Store2", "Vault", "Warehouse", "Workshop"]);
    expect(meta.branches[0]!.locations.find((l) => l.name === "Jobworker")!.type).toBe("JOB_WORKER");
  });
});

describe("operations section — queues with how long each has waited", () => {
  /** One piece with a job worker, one at hallmarking, one under repair, one transfer on the road. */
  async function queues() {
    const jw = await receive(w, { itemCode: "JW-1" });
    const hm = await receive(w, { itemCode: "HM-1" });
    const rp = await receive(w, { itemCode: "RP-1" });
    const tr = await receive(w, { itemCode: "TR-1" });
    await movePartner(ctx(), { type: "JOBWORK_ISSUE", itemIds: [jw.id], destinationLocationId: w.loc.jobworker });
    await movePartner(ctx(), { type: "HALLMARKING_OUT", itemIds: [hm.id], destinationLocationId: w.loc.hallmark });
    await movePartner(ctx(), { type: "REPAIR_OUT", itemIds: [rp.id], destinationLocationId: w.loc.repair });
    await createTransfer(ctx(), { fromLocationId: w.loc.counter, toLocationId: w.loc.store2, itemIds: [tr.id] });
    return { jw, hm, rp, tr };
  }

  it("counts pieces in each queue and lists the longest-waiting", async () => {
    await queues();
    const ops = ok(await createDashboardService().operations({}));
    expect([ops.jobWork.pieces, ops.hallmarking.pieces, ops.repairs.pieces]).toEqual([1, 1, 1]);
    expect(ops.jobWork.oldest[0]).toMatchObject({ itemCode: "JW-1", location: "Jobworker", days: 0 });
    expect(ops.hallmarking.oldest[0]).toMatchObject({ itemCode: "HM-1", location: "Hallmark" });
    expect(ops.repairs.oldest[0]).toMatchObject({ itemCode: "RP-1", location: "Repair" });
    expect(ops.transfers).toMatchObject({ inTransit: 1, pieces: 1, overdue: 0 });
    expect(ops.transfers.oldest[0]).toMatchObject({ from: "Counter", to: "Store2", pieces: 1 });
    expect(ops.thresholds).toEqual(ATTENTION_THRESHOLDS);
  });

  it("flags what has waited past the thresholds — measured from the ledger entry that put it there", async () => {
    await queues();
    const later = createDashboardService({ now: () => new Date(Date.now() + 20 * DAY) });
    const ops = ok(await later.operations({}));
    expect(ops.jobWork).toMatchObject({ pieces: 1, overdue: 1 });
    expect(ops.jobWork.oldest[0]!.days).toBe(20);
    expect(ops.transfers.overdue).toBe(1);
    const between = createDashboardService({ now: () => new Date(Date.now() + 5 * DAY) }); // past 3 days, before 14
    const mid = ok(await between.operations({}));
    expect(mid.transfers.overdue).toBe(1);
    expect(mid.jobWork.overdue).toBe(0);
  });

  it("orders the queue oldest first and caps the list", async () => {
    for (let i = 0; i < 7; i++) {
      const item = await receive(w, { itemCode: `Q-${i}` });
      await movePartner(ctx(), { type: "REPAIR_OUT", itemIds: [item.id], destinationLocationId: w.loc.repair });
    }
    const { repairs } = ok(await createDashboardService().operations({}));
    expect(repairs.pieces).toBe(7);
    expect(repairs.oldest).toHaveLength(5);
    expect(repairs.oldest.map((r) => r.itemCode)).toEqual(["Q-0", "Q-1", "Q-2", "Q-3", "Q-4"]);
  });

  it("leaves a piece out of a queue once it comes back", async () => {
    const item = await receive(w);
    await movePartner(ctx(), { type: "HALLMARKING_OUT", itemIds: [item.id], destinationLocationId: w.loc.hallmark });
    await movePartner(ctx(), { type: "HALLMARKING_IN", itemIds: [item.id], destinationLocationId: w.loc.counter });
    expect(ok(await createDashboardService().operations({})).hallmarking.pieces).toBe(0);
  });

  it("returns empty queues for an empty shop", async () => {
    const ops = ok(await createDashboardService().operations({}));
    expect(ops.jobWork).toEqual({ pieces: 0, overdue: 0, oldest: [] });
    expect(ops.transfers).toEqual({ inTransit: 0, pieces: 0, overdue: 0, oldest: [] });
  });
});

describe("alerts — drawn from real state, most urgent first", () => {
  it("says nothing needs attention when nothing does", async () => {
    await receive(w);
    expect(ok(await createDashboardService().alerts({}))).toEqual([]);
  });

  it("raises one alert per real problem, with counts and the screen that resolves it", async () => {
    const jw = await receive(w);
    const tr = await receive(w);
    const lapsed = await receive(w);
    const held = await receive(w);
    const back = await receive(w);
    const broken = await receive(w);
    const fresh = await receive(w);
    await movePartner(ctx(), { type: "JOBWORK_ISSUE", itemIds: [jw.id], destinationLocationId: w.loc.jobworker });
    await createTransfer(ctx(), { fromLocationId: w.loc.counter, toLocationId: w.loc.store2, itemIds: [tr.id] });
    await reserveItems(ctx(), { itemIds: [lapsed.id], referenceId: someOrder(), expiresAt: new Date(Date.now() - 1000) });
    await reserveItems(ctx(), { itemIds: [held.id], referenceId: someOrder(), expiresAt: new Date(Date.now() + 30 * DAY) }); // still valid on the day we look
    const order = someOrder();
    await sellItems(ctx(), { itemIds: [back.id], referenceType: "ORDER", referenceId: order });
    await returnItems(ctx(), { itemIds: [back.id], referenceType: "ORDER", referenceId: order, destinationLocationId: w.loc.counter });
    const adj = await requestAdjustment(ctx(), { itemId: broken.id, toStatus: "DAMAGED", reason: "Found bent" });
    await approveAdjustment(ctx(), adj.id);
    await requestAdjustment(ctx(), { itemId: fresh.id, toStatus: "DAMAGED", reason: "Looks cracked" });

    const later = createDashboardService({ now: () => new Date(Date.now() + 20 * DAY) });
    const alerts = ok(await later.alerts({}));
    const byId = Object.fromEntries(alerts.map((a) => [a.id, a]));

    expect(byId["transfers-overdue"]).toMatchObject({ severity: "warning", count: 1, href: "/inventory/transfers" });
    expect(byId["partner-overdue"]).toMatchObject({ severity: "warning", count: 1, detail: "job work 1" });
    expect(byId["reservations-lapsed"]).toMatchObject({ severity: "warning", count: 1, href: "/inventory/stock?status=RESERVED" });
    expect(byId["adjustments-pending"]).toMatchObject({ severity: "info", count: 1, href: "/inventory/adjustments" });
    expect(byId["returns-uninspected"]).toMatchObject({ severity: "info", count: 1 });
    expect(byId["damaged-pending"]).toMatchObject({ severity: "info", count: 1 });
    // Most urgent first: warnings before info.
    expect(alerts.map((a) => a.severity)).toEqual([...alerts.map((a) => a.severity)].sort((a, b) => ["critical", "warning", "info"].indexOf(a) - ["critical", "warning", "info"].indexOf(b)));
  });

  it("does not alert on a reservation that has not lapsed, or on a transfer that is not late", async () => {
    const held = await receive(w);
    const tr = await receive(w);
    await reserveItems(ctx(), { itemIds: [held.id], referenceId: someOrder(), expiresAt: new Date(Date.now() + 10 * DAY) });
    await reserveItems(ctx(), { itemIds: [tr.id], referenceId: someOrder() }); // no expiry at all
    expect(ok(await createDashboardService().alerts({}))).toEqual([]);
  });

  it("warns that an adjustment can no longer be approved once its piece has moved", async () => {
    const item = await receive(w);
    await requestAdjustment(ctx(), { itemId: item.id, toStatus: "DAMAGED", reason: "Looks cracked" });
    expect(ok(await createDashboardService().alerts({}))[0]).toMatchObject({ id: "adjustments-pending", severity: "info" });
    await reserveItems(ctx(), { itemIds: [item.id], referenceId: someOrder() }); // the piece moves on
    const [alert] = ok(await createDashboardService().alerts({}));
    expect(alert).toMatchObject({ id: "adjustments-pending", severity: "warning", count: 1 });
    expect(alert!.detail).toMatch(/can no longer be approved/);
  });

  it("scopes alerts to the chosen location", async () => {
    const item = await receive(w);
    const other = await receive(w, { locationId: w.loc.store2 });
    await requestAdjustment(ctx(), { itemId: item.id, toStatus: "DAMAGED", reason: "Looks cracked" });
    await requestAdjustment(ctx(), { itemId: other.id, toStatus: "DAMAGED", reason: "Found bent" });
    expect(ok(await createDashboardService().alerts({}))[0]).toMatchObject({ count: 2 });
    expect(ok(await createDashboardService().alerts({ locationId: w.loc.store2 }))[0]).toMatchObject({ count: 1 });
  });
});

describe("activity section — the latest movements in the range", () => {
  it("lists newest first with who, what and where", async () => {
    const a = await receive(w, { itemCode: "ACT-A" });
    const user = someUser();
    await movePartner({ performedBy: user }, { type: "HALLMARKING_OUT", itemIds: [a.id], destinationLocationId: w.loc.hallmark });
    const { rows, total } = ok(await createDashboardService().activity({}));
    expect(total).toBe(2);
    expect(rows[0]).toMatchObject({ movementType: "HALLMARKING_OUT", itemCode: "ACT-A", to: "Hallmark", from: "Counter" });
    expect(rows[1]).toMatchObject({ movementType: "PURCHASE_RECEIPT", itemCode: "ACT-A" });
    expect(rows[0]!.actor).toBe("Unknown user"); // a user id with no user row: named honestly, not blank
  });

  it("applies the date range, and caps the list at ten while still reporting the total", async () => {
    for (let i = 0; i < 12; i++) await receive(w);
    const dash = createDashboardService();
    const all = ok(await dash.activity({}));
    expect(all.rows).toHaveLength(10);
    expect(all.total).toBe(12);
    expect(ok(await dash.activity({ from: "2020-01-01", to: "2020-01-31" })).total).toBe(0);
    expect(ok(await dash.activity({ from: "2020-01-01", to: "2020-01-31" })).rows).toEqual([]);
  });

  it("reports which range it applied", async () => {
    const section = await createDashboardService().activity({ from: "2026-09-01", to: "2026-09-10" });
    expect(section).toMatchObject({ status: "OK", scope: { range: { from: "2026-09-01", to: "2026-09-10" }, honours: { dateRange: true } } });
  });
});

describe("sales and B2B sections — no provider, no numbers", () => {
  it("say NOT_CONNECTED, naming what they need, instead of returning zeros", async () => {
    const dash = createDashboardService();
    expect(await dash.sales({}, { canSeeMargin: true })).toMatchObject({ status: "NOT_CONNECTED", requires: "Orders module" });
    expect(await dash.b2b({})).toMatchObject({ status: "NOT_CONNECTED" });
    expect(JSON.stringify(await dash.sales({}, { canSeeMargin: true }))).not.toMatch(/revenue"\s*:\s*\{/);
  });
});
