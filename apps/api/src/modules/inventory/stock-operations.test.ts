import { beforeEach, describe, expect, it } from "vitest";
import { type World, makeWorld, receive, someOrder, someUser } from "../../../test/inventory-fixtures";
import { InventoryItemModel } from "./inventory-item.model";
import { InventoryLedgerModel } from "./inventory-ledger.model";
import { createInventoryItem } from "./inventory-item.service";
import { listLedgerForItem } from "./inventory-ledger.repository";
import { postInventoryTransaction, receiveNewInventoryItem } from "./inventory-transaction.service";
import { reconcileAll, reconcileItem } from "./reconciliation";
import { StockAdjustmentModel } from "./stock-adjustment.model";
import {
  SYSTEM_ACTOR_ID,
  approveAdjustment,
  cancelTransfer,
  createTransfer,
  inspectReturnedItems,
  movePartner,
  receiveTransfer,
  rejectAdjustment,
  releaseExpiredReservations,
  releaseItems,
  requestAdjustment,
  reserveItems,
  returnItems,
  sellItems,
  updateItemIdentifiers,
} from "./stock-operations";
import { StockTransferModel } from "./stock-transfer.model";
import { TransactionModel } from "./transaction.model";

let w: World;
const ctx = () => ({ performedBy: someUser() });
const fresh = async (id: string) => (await InventoryItemModel.findById(id).lean())!;
const ledger = (id: string) => listLedgerForItem(id);
const counts = async () => ({ tx: await TransactionModel.countDocuments(), led: await InventoryLedgerModel.countDocuments() });
const expectConsistent = async (...ids: string[]) => {
  for (const id of ids) expect(await reconcileItem(id), id).toMatchObject({ ok: true, problems: [] });
};

beforeEach(async () => {
  w = await makeWorld();
});

// ---------------------------------------------------------------------------------------------
describe("receiving stock", () => {
  it("creates the item and ledger entry #1 together, allocating an item code", async () => {
    const { item, entry } = await receiveNewInventoryItem({
      item: { type: "FINISHED_JEWELLERY", grossWeight: 12.345, stoneWeight: 0.5, metalId: w.gold, purity: "22K", locationId: w.loc.counter, cost: 100_000 } as never,
      performedBy: someUser(),
      channel: "ERP",
      referenceType: "MANUAL",
    });
    expect(item.itemCode).toMatch(/^JE-\d{6}$/);
    expect(item).toMatchObject({ netWeight: 11.845, status: "AVAILABLE", ledgerSeq: 1 });
    expect(entry).toMatchObject({ sequence: 1, movementType: "PURCHASE_RECEIPT", quantity: 1, balanceAfter: { grossWeight: 12.345, stoneWeight: 0.5, netWeight: 11.845 } });
    await expectConsistent(item.id);
  });

  it("allocates distinct, increasing item codes under concurrency", async () => {
    const items = await Promise.all(Array.from({ length: 6 }, () => receive(w, { itemCode: undefined })));
    expect(new Set(items.map((i) => i.itemCode)).size).toBe(6);
  });

  describe("duplicate identifiers", () => {
    it("refuses a duplicate HUID, names it, and leaves no orphan transaction or ledger row", async () => {
      await receive(w, { huid: "AB12CD" });
      const before = await counts();
      await expect(receive(w, { huid: "AB12CD" })).rejects.toMatchObject({ code: "DUPLICATE_IDENTIFIER", message: expect.stringContaining("HUID AB12CD") });
      expect(await counts()).toEqual(before);
      expect(await InventoryItemModel.countDocuments({ huid: "AB12CD" })).toBe(1);
    });

    it("treats HUIDs case-insensitively (ab12cd == AB12CD)", async () => {
      await receive(w, { huid: "ab12cd" });
      await expect(receive(w, { huid: "AB12CD" })).rejects.toMatchObject({ code: "DUPLICATE_IDENTIFIER" });
    });

    it("refuses duplicate item codes and barcodes", async () => {
      await receive(w, { itemCode: "DUP-1", barcode: "BC-1" });
      await expect(receive(w, { itemCode: "DUP-1" })).rejects.toMatchObject({ code: "DUPLICATE_IDENTIFIER", message: expect.stringContaining("item code") });
      await expect(receive(w, { barcode: "BC-1" })).rejects.toMatchObject({ code: "DUPLICATE_IDENTIFIER", message: expect.stringContaining("barcode") });
    });

    it("stops two racing receipts with the same HUID: exactly one is created", async () => {
      const results = await Promise.allSettled([receive(w, { huid: "RACE01" }), receive(w, { huid: "RACE01" }), receive(w, { huid: "RACE01" })]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      for (const r of results.filter((r) => r.status === "rejected")) expect((r as PromiseRejectedResult).reason).toMatchObject({ code: "DUPLICATE_IDENTIFIER" });
      expect(await InventoryItemModel.countDocuments({ huid: "RACE01" })).toBe(1);
      expect(await InventoryLedgerModel.countDocuments()).toBe(1);
    });

    it("sets a HUID once via identifiers (marks it hallmarked), refuses to change it or to duplicate another's", async () => {
      const a = await receive(w);
      const b = await receive(w, { huid: "TAKEN1" });
      const set = await updateItemIdentifiers(a.id, { huid: "ab12cd" });
      expect(set).toMatchObject({ huid: "AB12CD", hallmarkStatus: "HALLMARKED" });
      await expect(updateItemIdentifiers(a.id, { huid: "ZZ99ZZ" })).rejects.toMatchObject({ code: "DUPLICATE_IDENTIFIER", message: expect.stringMatching(/cannot be changed/) });
      await expect(updateItemIdentifiers(a.id, { huid: "AB12CD" })).resolves.toMatchObject({ huid: "AB12CD" }); // same value is a no-op
      const c = await receive(w);
      await expect(updateItemIdentifiers(c.id, { huid: "TAKEN1" })).rejects.toMatchObject({ code: "DUPLICATE_IDENTIFIER" });
      expect((await fresh(b.id)).huid).toBe("TAKEN1");
    });
  });

  describe("invalid weights", () => {
    const input = (over: Record<string, unknown>) => receive(w, over);
    it.each([
      ["zero", { grossWeight: 0 }],
      ["negative", { grossWeight: -3 }],
      ["stone heavier than the piece", { grossWeight: 5, stoneWeight: 6 }],
      ["all stone on a metal piece", { grossWeight: 5, stoneWeight: 5 }],
      ["more than 3 decimals", { grossWeight: 5.0001 }],
    ])("refuses %s and writes nothing", async (_n, over) => {
      const before = await counts();
      await expect(input(over)).rejects.toThrow();
      expect(await counts()).toEqual(before);
      expect(await InventoryItemModel.countDocuments()).toBe(0);
    });
    it("refuses a purity the metal doesn't have", async () => {
      await expect(input({ purity: "14K" })).rejects.toThrow();
    });
    it("refuses a unit item with quantity above one", async () => {
      await expect(input({ quantity: 5 })).rejects.toThrow(/quantity 1/);
    });
  });

  it("won't receive stock into a job worker, an inactive location, or an unknown one", async () => {
    await expect(receive(w, { locationId: w.loc.jobworker })).rejects.toThrow(/cannot be received into/);
    await expect(receive(w, { locationId: "64b0c0ffee0000000000ffff" })).rejects.toThrow(/not found/i);
  });
});

// ---------------------------------------------------------------------------------------------
describe("reservation, release, sale, return", () => {
  it("reserving holds the piece for one order and records it in the ledger", async () => {
    const item = await receive(w);
    const order = someOrder();
    const { entries } = await reserveItems(ctx(), { itemIds: [item.id], referenceId: order });
    expect(entries[0]).toMatchObject({ movementType: "RESERVATION", fromStatus: "AVAILABLE", toStatus: "RESERVED", sequence: 2 });
    const held = await fresh(item.id);
    expect(held.status).toBe("RESERVED");
    expect(String(held.reservation!.referenceId)).toBe(order);
    await expectConsistent(item.id);
  });

  it("a held piece can't be reserved again by anyone, including the same order", async () => {
    const item = await receive(w);
    const first = someOrder();
    await reserveItems(ctx(), { itemIds: [item.id], referenceId: first });
    await expect(reserveItems(ctx(), { itemIds: [item.id], referenceId: someOrder() })).rejects.toMatchObject({ code: "ILLEGAL_TRANSITION" });
    await expect(reserveItems(ctx(), { itemIds: [item.id], referenceId: first })).rejects.toMatchObject({ code: "ILLEGAL_TRANSITION" });
    expect(String((await fresh(item.id)).reservation!.referenceId)).toBe(first);
    expect((await ledger(item.id)).filter((e) => e.movementType === "RESERVATION")).toHaveLength(1);
  });

  it("is all-or-nothing across several pieces", async () => {
    const [a, b] = [await receive(w), await receive(w)];
    await sellItems(ctx(), { itemIds: [b.id], referenceType: "ORDER", referenceId: someOrder() });
    const before = await counts();
    await expect(reserveItems(ctx(), { itemIds: [a.id, b.id], referenceId: someOrder() })).rejects.toMatchObject({ code: "ILLEGAL_TRANSITION" });
    expect((await fresh(a.id)).status).toBe("AVAILABLE");
    expect(await counts()).toEqual(before);
  });

  it("release by the holding order puts the piece back on sale and clears the hold", async () => {
    const item = await receive(w);
    const order = someOrder();
    await reserveItems(ctx(), { itemIds: [item.id], referenceId: order });
    const { entries } = await releaseItems(ctx(), { itemIds: [item.id], referenceId: order });
    expect(entries[0]).toMatchObject({ movementType: "RELEASE_RESERVATION", fromStatus: "RESERVED", toStatus: "AVAILABLE" });
    const back = await fresh(item.id);
    expect(back.status).toBe("AVAILABLE");
    expect(back.reservation).toBeUndefined();
    await reserveItems(ctx(), { itemIds: [item.id], referenceId: someOrder() }); // and it can be held again
    await expectConsistent(item.id);
  });

  it("another order can't release your hold — unless it is an explicit override", async () => {
    const item = await receive(w);
    const order = someOrder();
    await reserveItems(ctx(), { itemIds: [item.id], referenceId: order });
    await expect(releaseItems(ctx(), { itemIds: [item.id], referenceId: someOrder() })).rejects.toMatchObject({ code: "RESERVED_FOR_OTHER" });
    expect((await fresh(item.id)).status).toBe("RESERVED");
    await releaseItems(ctx(), { itemIds: [item.id], referenceId: someOrder(), force: true, reason: "Order abandoned" });
    expect((await fresh(item.id)).status).toBe("AVAILABLE");
  });

  it("releasing something that isn't reserved is refused", async () => {
    const item = await receive(w);
    await expect(releaseItems(ctx(), { itemIds: [item.id], referenceId: someOrder() })).rejects.toMatchObject({ code: "ILLEGAL_TRANSITION" });
  });

  it("sells a piece reserved for the same order, clearing the hold", async () => {
    const item = await receive(w);
    const order = someOrder();
    await reserveItems(ctx(), { itemIds: [item.id], referenceId: order });
    const { entries } = await sellItems(ctx(), { itemIds: [item.id], referenceType: "ORDER", referenceId: order });
    expect(entries[0]).toMatchObject({ movementType: "SALE", fromStatus: "RESERVED", toStatus: "SOLD" });
    const sold = await fresh(item.id);
    expect(sold.status).toBe("SOLD");
    expect(sold.reservation).toBeUndefined();
    await expectConsistent(item.id);
  });

  it("refuses to sell a piece reserved for a different order", async () => {
    const item = await receive(w);
    await reserveItems(ctx(), { itemIds: [item.id], referenceId: someOrder() });
    await expect(sellItems(ctx(), { itemIds: [item.id], referenceType: "ORDER", referenceId: someOrder() })).rejects.toMatchObject({ code: "RESERVED_FOR_OTHER" });
    expect((await fresh(item.id)).status).toBe("RESERVED");
  });

  it("sells an unreserved piece directly, once — a sold piece can't be sold, reserved or released again", async () => {
    const item = await receive(w);
    const order = someOrder();
    await sellItems(ctx(), { itemIds: [item.id], referenceType: "ORDER", referenceId: order });
    await expect(sellItems(ctx(), { itemIds: [item.id], referenceType: "ORDER", referenceId: order })).rejects.toMatchObject({ code: "ILLEGAL_TRANSITION" });
    await expect(reserveItems(ctx(), { itemIds: [item.id], referenceId: someOrder() })).rejects.toMatchObject({ code: "ILLEGAL_TRANSITION" });
    await expect(releaseItems(ctx(), { itemIds: [item.id], referenceId: order })).rejects.toMatchObject({ code: "ILLEGAL_TRANSITION" });
  });

  it("can't sell what isn't on hand: in transit, at hallmarking, with a job worker, under repair, scrapped", async () => {
    const [a, b, c, d] = [await receive(w), await receive(w), await receive(w), await receive(w)];
    await createTransfer(ctx(), { fromLocationId: w.loc.counter, toLocationId: w.loc.warehouse, itemIds: [a.id] });
    await movePartner(ctx(), { type: "HALLMARKING_OUT", itemIds: [b.id], destinationLocationId: w.loc.hallmark });
    await movePartner(ctx(), { type: "JOBWORK_ISSUE", itemIds: [c.id], destinationLocationId: w.loc.jobworker });
    await movePartner(ctx(), { type: "REPAIR_OUT", itemIds: [d.id], destinationLocationId: w.loc.repair });
    for (const id of [a.id, b.id, c.id, d.id]) await expect(sellItems(ctx(), { itemIds: [id], referenceType: "ORDER", referenceId: someOrder() })).rejects.toMatchObject({ code: "ILLEGAL_TRANSITION" });
  });

  describe("return", () => {
    async function soldItem() {
      const item = await receive(w);
      const order = someOrder();
      await sellItems(ctx(), { itemIds: [item.id], referenceType: "ORDER", referenceId: order });
      return { item, order };
    }

    it("takes a sold piece back into a stock location (SOLD → RETURNED)", async () => {
      const { item, order } = await soldItem();
      const { entries } = await returnItems(ctx(), { itemIds: [item.id], destinationLocationId: w.loc.store2, referenceType: "ORDER", referenceId: order, reason: "Customer changed mind" });
      expect(entries[0]).toMatchObject({ movementType: "RETURN", fromStatus: "SOLD", toStatus: "RETURNED", destinationLocationId: w.loc.store2 });
      expect(await fresh(item.id)).toMatchObject({ status: "RETURNED", locationId: expect.anything() });
      await expectConsistent(item.id);
    });

    it("refuses to return a piece that was never sold", async () => {
      const item = await receive(w);
      await expect(returnItems(ctx(), { itemIds: [item.id], destinationLocationId: w.loc.counter })).rejects.toMatchObject({ code: "ILLEGAL_TRANSITION" });
    });

    it("refuses to return a piece straight back to a partner location", async () => {
      const { item } = await soldItem();
      await expect(returnItems(ctx(), { itemIds: [item.id], destinationLocationId: w.loc.jobworker })).rejects.toThrow(/cannot use/);
      expect((await fresh(item.id)).status).toBe("SOLD");
    });

    it("a returned piece is not sellable until inspected; inspection restocks it or writes it down as damaged", async () => {
      const { item } = await soldItem();
      await returnItems(ctx(), { itemIds: [item.id], destinationLocationId: w.loc.counter });
      await expect(sellItems(ctx(), { itemIds: [item.id], referenceType: "ORDER", referenceId: someOrder() })).rejects.toMatchObject({ code: "ILLEGAL_TRANSITION" });
      await inspectReturnedItems(ctx(), { itemIds: [item.id], outcome: "AVAILABLE", destinationLocationId: w.loc.counter });
      expect((await fresh(item.id)).status).toBe("AVAILABLE");
      // and it can be sold again — the full circle
      await sellItems(ctx(), { itemIds: [item.id], referenceType: "ORDER", referenceId: someOrder() });
      expect((await ledger(item.id)).map((e) => e.movementType)).toEqual(["PURCHASE_RECEIPT", "SALE", "RETURN", "RETURN", "SALE"]);
      await expectConsistent(item.id);

      const other = (await soldItem()).item;
      await returnItems(ctx(), { itemIds: [other.id], destinationLocationId: w.loc.counter });
      await inspectReturnedItems(ctx(), { itemIds: [other.id], outcome: "DAMAGED", destinationLocationId: w.loc.counter });
      expect((await fresh(other.id)).status).toBe("DAMAGED");
    });
  });

  describe("reservation expiry", () => {
    it("releases lapsed holds as the system actor, leaves live and open-ended ones, and skips what changed underneath", async () => {
      const [lapsed, live, open, sold] = [await receive(w), await receive(w), await receive(w), await receive(w)];
      const past = new Date(Date.now() - 60_000);
      const future = new Date(Date.now() + 3_600_000);
      const oSold = someOrder();
      await reserveItems(ctx(), { itemIds: [lapsed.id], referenceId: someOrder(), expiresAt: past });
      await reserveItems(ctx(), { itemIds: [live.id], referenceId: someOrder(), expiresAt: future });
      await reserveItems(ctx(), { itemIds: [open.id], referenceId: someOrder() });
      await reserveItems(ctx(), { itemIds: [sold.id], referenceId: oSold, expiresAt: past });
      await sellItems(ctx(), { itemIds: [sold.id], referenceType: "ORDER", referenceId: oSold }); // sold before the sweep ran

      expect(await releaseExpiredReservations()).toEqual({ released: 1, skipped: 0 });
      expect((await fresh(lapsed.id)).status).toBe("AVAILABLE");
      expect((await fresh(live.id)).status).toBe("RESERVED");
      expect((await fresh(open.id)).status).toBe("RESERVED");
      expect((await fresh(sold.id)).status).toBe("SOLD");
      const tx = await TransactionModel.findOne({ reason: "Reservation expired" }).lean();
      expect(String(tx!.performedBy)).toBe(SYSTEM_ACTOR_ID);
      expect(await releaseExpiredReservations()).toEqual({ released: 0, skipped: 0 }); // idempotent
    });
  });
});

// ---------------------------------------------------------------------------------------------
describe("transfers", () => {
  it("dispatch puts pieces IN_TRANSIT (owned by neither shelf), records TRANSFER_OUT, and creates the transfer", async () => {
    const [a, b] = [await receive(w), await receive(w)];
    const t = await createTransfer(ctx(), { fromLocationId: w.loc.counter, toLocationId: w.loc.warehouse, itemIds: [a.id, b.id], notes: "Weekly restock" });
    expect(t).toMatchObject({ transferNo: expect.stringMatching(/^TRF-\d{6}$/), status: "IN_TRANSIT", notes: "Weekly restock" });
    expect(t.lines.map((l) => l.state)).toEqual(["PENDING", "PENDING"]);
    for (const id of [a.id, b.id]) {
      const it = await fresh(id);
      expect(it.status).toBe("IN_TRANSIT");
      expect(String(it.locationId)).toBe(w.loc.warehouse);
      const last = (await ledger(id)).at(-1)!;
      expect(last).toMatchObject({ movementType: "TRANSFER_OUT", fromStatus: "AVAILABLE", toStatus: "IN_TRANSIT", sourceLocationId: w.loc.counter, destinationLocationId: w.loc.warehouse });
    }
    const tx = await TransactionModel.findOne({ type: "TRANSFER_OUT" }).lean();
    expect(tx).toMatchObject({ referenceType: "STOCK_TRANSFER" });
    expect(String(tx!.referenceId)).toBe(t.id);
    await expectConsistent(a.id, b.id);
  });

  it("receipt makes them AVAILABLE at the destination and closes the transfer", async () => {
    const [a, b] = [await receive(w), await receive(w)];
    const t = await createTransfer(ctx(), { fromLocationId: w.loc.counter, toLocationId: w.loc.warehouse, itemIds: [a.id, b.id] });
    const done = await receiveTransfer(ctx(), t.id);
    expect(done.status).toBe("RECEIVED");
    expect(done.lines.every((l) => l.state === "RECEIVED" && l.resolvedAt)).toBe(true);
    for (const id of [a.id, b.id]) {
      expect(await fresh(id)).toMatchObject({ status: "AVAILABLE" });
      expect((await ledger(id)).map((e) => e.movementType)).toEqual(["PURCHASE_RECEIPT", "TRANSFER_OUT", "TRANSFER_IN"]);
    }
    await expectConsistent(a.id, b.id);
  });

  it("supports partial receipt — the transfer stays open until the last piece is resolved", async () => {
    const [a, b, c] = [await receive(w), await receive(w), await receive(w)];
    const t = await createTransfer(ctx(), { fromLocationId: w.loc.counter, toLocationId: w.loc.store2, itemIds: [a.id, b.id, c.id] });
    const part = await receiveTransfer(ctx(), t.id, [a.id]);
    expect(part.status).toBe("IN_TRANSIT");
    expect(part.lines.map((l) => l.state)).toEqual(["RECEIVED", "PENDING", "PENDING"]);
    expect((await fresh(b.id)).status).toBe("IN_TRANSIT");
    await expect(receiveTransfer(ctx(), t.id, [a.id])).rejects.toThrow(/not pending/);
    expect((await receiveTransfer(ctx(), t.id)).status).toBe("RECEIVED");
  });

  it("cancel sends every pending piece back to the source", async () => {
    const [a, b] = [await receive(w), await receive(w)];
    const t = await createTransfer(ctx(), { fromLocationId: w.loc.counter, toLocationId: w.loc.warehouse, itemIds: [a.id, b.id] });
    const cancelled = await cancelTransfer(ctx(), t.id, "Wrong bag");
    expect(cancelled.status).toBe("CANCELLED");
    expect(cancelled.lines.every((l) => l.state === "RETURNED")).toBe(true);
    for (const id of [a.id, b.id]) {
      const it = await fresh(id);
      expect(it.status).toBe("AVAILABLE");
      expect(String(it.locationId)).toBe(w.loc.counter);
      expect((await ledger(id)).at(-1)).toMatchObject({ movementType: "TRANSFER_IN", destinationLocationId: w.loc.counter });
    }
    await expectConsistent(a.id, b.id);
  });

  it("cancelling after a partial receipt returns only the rest; the transfer closes as RECEIVED", async () => {
    const [a, b] = [await receive(w), await receive(w)];
    const t = await createTransfer(ctx(), { fromLocationId: w.loc.counter, toLocationId: w.loc.warehouse, itemIds: [a.id, b.id] });
    await receiveTransfer(ctx(), t.id, [a.id]);
    const closed = await cancelTransfer(ctx(), t.id);
    expect(closed.status).toBe("RECEIVED");
    expect(String((await fresh(a.id)).locationId)).toBe(w.loc.warehouse);
    expect(String((await fresh(b.id)).locationId)).toBe(w.loc.counter);
  });

  it("a closed transfer can't be received or cancelled again", async () => {
    const a = await receive(w);
    const t = await createTransfer(ctx(), { fromLocationId: w.loc.counter, toLocationId: w.loc.warehouse, itemIds: [a.id] });
    await receiveTransfer(ctx(), t.id);
    await expect(receiveTransfer(ctx(), t.id)).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(cancelTransfer(ctx(), t.id)).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("is all-or-nothing: one ineligible piece stops the whole dispatch and nothing is written", async () => {
    const [a, held] = [await receive(w), await receive(w)];
    await reserveItems(ctx(), { itemIds: [held.id], referenceId: someOrder() });
    const before = await counts();
    await expect(createTransfer(ctx(), { fromLocationId: w.loc.counter, toLocationId: w.loc.warehouse, itemIds: [a.id, held.id] })).rejects.toMatchObject({ code: "ILLEGAL_TRANSITION" });
    expect((await fresh(a.id)).status).toBe("AVAILABLE");
    expect(await counts()).toEqual(before);
    expect(await StockTransferModel.countDocuments()).toBe(0);
  });

  it("only moves pieces that are actually at the stated source", async () => {
    const [here, elsewhere] = [await receive(w), await receive(w, { locationId: w.loc.vault })];
    await expect(createTransfer(ctx(), { fromLocationId: w.loc.counter, toLocationId: w.loc.warehouse, itemIds: [here.id, elsewhere.id] })).rejects.toThrow(/not at the source/);
    expect((await fresh(here.id)).status).toBe("AVAILABLE");
  });

  it("transfers are between stock locations only, active, and different", async () => {
    const a = await receive(w);
    await expect(createTransfer(ctx(), { fromLocationId: w.loc.counter, toLocationId: w.loc.jobworker, itemIds: [a.id] })).rejects.toThrow(/transfers are between/);
    await expect(createTransfer(ctx(), { fromLocationId: w.loc.counter, toLocationId: w.loc.counter, itemIds: [a.id] })).rejects.toThrow(/must differ/);
    await expect(createTransfer(ctx(), { fromLocationId: w.loc.counter, toLocationId: "64b0c0ffee0000000000ffff", itemIds: [a.id] })).rejects.toThrow(/not found/i);
    await expect(createTransfer(ctx(), { fromLocationId: w.loc.counter, toLocationId: w.loc.warehouse, itemIds: ["64b0c0ffee0000000000ffff"] })).rejects.toThrow(/not found/i);
  });

  it("a piece in transit can't be reserved, sold, or put into another transfer", async () => {
    const a = await receive(w);
    await createTransfer(ctx(), { fromLocationId: w.loc.counter, toLocationId: w.loc.warehouse, itemIds: [a.id] });
    await expect(reserveItems(ctx(), { itemIds: [a.id], referenceId: someOrder() })).rejects.toMatchObject({ code: "ILLEGAL_TRANSITION" });
    await expect(createTransfer(ctx(), { fromLocationId: w.loc.warehouse, toLocationId: w.loc.store2, itemIds: [a.id] })).rejects.toMatchObject({ code: "ILLEGAL_TRANSITION" });
  });

  it("a piece damaged in transit can't be received as if it were fine", async () => {
    const a = await receive(w);
    const t = await createTransfer(ctx(), { fromLocationId: w.loc.counter, toLocationId: w.loc.warehouse, itemIds: [a.id] });
    const adj = await requestAdjustment({ performedBy: someUser() }, { itemId: a.id, reason: "Broke clasp in transit", toStatus: "DAMAGED" });
    await approveAdjustment(ctx(), adj.id);
    await expect(receiveTransfer(ctx(), t.id)).rejects.toMatchObject({ code: "ILLEGAL_TRANSITION" });
    expect((await fresh(a.id)).status).toBe("DAMAGED");
  });
});

// ---------------------------------------------------------------------------------------------
describe("partner movements", () => {
  it("hallmarking: OUT marks it pending, IN with the HUID marks it hallmarked and puts it back on the shelf", async () => {
    const a = await receive(w);
    await movePartner(ctx(), { type: "HALLMARKING_OUT", itemIds: [a.id], destinationLocationId: w.loc.hallmark });
    expect(await fresh(a.id)).toMatchObject({ status: "HALLMARKING", hallmarkStatus: "PENDING" });
    await movePartner(ctx(), { type: "HALLMARKING_IN", itemIds: [a.id], destinationLocationId: w.loc.vault, hallmarkResults: [{ itemId: a.id, huid: "ab12cd" }] });
    expect(await fresh(a.id)).toMatchObject({ status: "AVAILABLE", hallmarkStatus: "HALLMARKED", huid: "AB12CD" });
    expect(String((await fresh(a.id)).locationId)).toBe(w.loc.vault);
    await expectConsistent(a.id);
  });

  it("refuses a HUID already on another piece and rolls the whole movement back", async () => {
    const [a, b] = [await receive(w), await receive(w, { huid: "USED01" })];
    await movePartner(ctx(), { type: "HALLMARKING_OUT", itemIds: [a.id], destinationLocationId: w.loc.hallmark });
    await expect(movePartner(ctx(), { type: "HALLMARKING_IN", itemIds: [a.id], destinationLocationId: w.loc.vault, hallmarkResults: [{ itemId: a.id, huid: "USED01" }] })).rejects.toMatchObject({ code: "DUPLICATE_IDENTIFIER" });
    expect(await fresh(a.id)).toMatchObject({ status: "HALLMARKING" });
    expect((await ledger(a.id)).at(-1)!.movementType).toBe("HALLMARKING_OUT");
    expect((await fresh(b.id)).huid).toBe("USED01");
  });

  it("a hallmarked piece keeps its HUID: a different one from a later hallmark is refused", async () => {
    const a = await receive(w, { huid: "FIRST1" });
    await movePartner(ctx(), { type: "HALLMARKING_OUT", itemIds: [a.id], destinationLocationId: w.loc.hallmark });
    await expect(movePartner(ctx(), { type: "HALLMARKING_IN", itemIds: [a.id], destinationLocationId: w.loc.counter, hallmarkResults: [{ itemId: a.id, huid: "OTHER2" }] })).rejects.toMatchObject({ code: "DUPLICATE_IDENTIFIER" });
  });

  it("each partner movement only accepts the right kind of partner location", async () => {
    const a = await receive(w);
    await expect(movePartner(ctx(), { type: "HALLMARKING_OUT", itemIds: [a.id], destinationLocationId: w.loc.store2 })).rejects.toThrow(/cannot use/);
    await expect(movePartner(ctx(), { type: "JOBWORK_ISSUE", itemIds: [a.id], destinationLocationId: w.loc.hallmark })).rejects.toThrow(/cannot use/);
    await expect(movePartner(ctx(), { type: "REPAIR_OUT", itemIds: [a.id], destinationLocationId: w.loc.jobworker })).rejects.toThrow(/cannot use/);
    await expect(movePartner(ctx(), { type: "MANUFACTURING_ISSUE", itemIds: [a.id], destinationLocationId: w.loc.repair })).rejects.toThrow(/cannot use/);
    expect((await fresh(a.id)).status).toBe("AVAILABLE");
  });

  it("the way back must land in a stock location, not another partner", async () => {
    const a = await receive(w);
    await movePartner(ctx(), { type: "JOBWORK_ISSUE", itemIds: [a.id], destinationLocationId: w.loc.jobworker });
    await expect(movePartner(ctx(), { type: "JOBWORK_RECEIPT", itemIds: [a.id], destinationLocationId: w.loc.jobworker })).rejects.toThrow(/cannot use/);
    await movePartner(ctx(), { type: "JOBWORK_RECEIPT", itemIds: [a.id], destinationLocationId: w.loc.warehouse });
    expect(await fresh(a.id)).toMatchObject({ status: "AVAILABLE" });
  });

  it("job work, repair and manufacturing each complete a full out-and-back trip", async () => {
    const [j, r, m] = [await receive(w), await receive(w), await receive(w, { type: "SEMI_FINISHED" })];
    await movePartner(ctx(), { type: "JOBWORK_ISSUE", itemIds: [j.id], destinationLocationId: w.loc.jobworker });
    expect((await fresh(j.id)).status).toBe("WITH_JOB_WORKER");
    await movePartner(ctx(), { type: "JOBWORK_RECEIPT", itemIds: [j.id], destinationLocationId: w.loc.counter });
    await movePartner(ctx(), { type: "REPAIR_OUT", itemIds: [r.id], destinationLocationId: w.loc.repair });
    expect((await fresh(r.id)).status).toBe("UNDER_REPAIR");
    await movePartner(ctx(), { type: "REPAIR_IN", itemIds: [r.id], destinationLocationId: w.loc.counter });
    await movePartner(ctx(), { type: "MANUFACTURING_ISSUE", itemIds: [m.id], destinationLocationId: w.loc.workshop });
    await movePartner(ctx(), { type: "MANUFACTURING_RECEIPT", itemIds: [m.id], destinationLocationId: w.loc.vault });
    for (const id of [j.id, r.id, m.id]) expect((await fresh(id)).status).toBe("AVAILABLE");
    await expectConsistent(j.id, r.id, m.id);
  });

  it("a movement can't start from a status that doesn't own it (SOLD to hallmarking, RECEIPT without ISSUE)", async () => {
    const [s, a] = [await receive(w), await receive(w)];
    await sellItems(ctx(), { itemIds: [s.id], referenceType: "ORDER", referenceId: someOrder() });
    await expect(movePartner(ctx(), { type: "HALLMARKING_OUT", itemIds: [s.id], destinationLocationId: w.loc.hallmark })).rejects.toMatchObject({ code: "ILLEGAL_TRANSITION" });
    await expect(movePartner(ctx(), { type: "JOBWORK_RECEIPT", itemIds: [a.id], destinationLocationId: w.loc.counter })).rejects.toMatchObject({ code: "ILLEGAL_TRANSITION" });
  });
});

// ---------------------------------------------------------------------------------------------
describe("adjustments (request → someone else approves → ledger)", () => {
  it("a request changes nothing: no ledger entry, no status change — until it is approved", async () => {
    const a = await receive(w);
    const before = await counts();
    const adj = await requestAdjustment(ctx(), { itemId: a.id, reason: "Cracked stone found at counter", toStatus: "DAMAGED" });
    expect(adj).toMatchObject({ status: "PENDING", adjustmentNo: expect.stringMatching(/^ADJ-\d{6}$/), expectedLedgerSeq: 1 });
    expect(await counts()).toEqual(before);
    expect((await fresh(a.id)).status).toBe("AVAILABLE");
  });

  it("approval by a different person posts the ledger entry and closes the request", async () => {
    const a = await receive(w);
    const requester = someUser();
    const adj = await requestAdjustment({ performedBy: requester }, { itemId: a.id, reason: "Cracked stone found at counter", toStatus: "DAMAGED" });
    const approver = someUser();
    const done = await approveAdjustment({ performedBy: approver }, adj.id, "Confirmed by inspection");
    expect(done).toMatchObject({ status: "APPROVED", decidedBy: approver, decisionNote: "Confirmed by inspection" });
    expect(await fresh(a.id)).toMatchObject({ status: "DAMAGED" });
    const entry = (await ledger(a.id)).at(-1)!;
    expect(entry).toMatchObject({ movementType: "ADJUSTMENT", fromStatus: "AVAILABLE", toStatus: "DAMAGED" });
    const tx = await TransactionModel.findById(done.transactionId).lean();
    expect(tx).toMatchObject({ referenceType: "ADJUSTMENT", reason: "Cracked stone found at counter" });
    expect(String(tx!.performedBy)).toBe(approver);
    await expectConsistent(a.id);
  });

  it("nobody can approve their own request", async () => {
    const a = await receive(w);
    const me = someUser();
    const adj = await requestAdjustment({ performedBy: me }, { itemId: a.id, reason: "Cracked stone found at counter", toStatus: "DAMAGED" });
    await expect(approveAdjustment({ performedBy: me }, adj.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await fresh(a.id)).status).toBe("AVAILABLE");
    expect((await StockAdjustmentModel.findById(adj.id).lean())!.status).toBe("PENDING");
  });

  it("re-weighing a piece recomputes net and fine weight, and the ledger records the deltas and the new balance", async () => {
    const a = await receive(w, { grossWeight: 10, stoneWeight: 0 });
    const adj = await requestAdjustment(ctx(), { itemId: a.id, reason: "Re-weighed on calibrated scale", grossWeight: 9.5 });
    await approveAdjustment(ctx(), adj.id);
    expect(await fresh(a.id)).toMatchObject({ grossWeight: 9.5, netWeight: 9.5, fineWeight: 8.702, status: "AVAILABLE" });
    const entry = (await ledger(a.id)).at(-1)!;
    expect(entry).toMatchObject({ grossWeight: -0.5, netWeight: -0.5, fineWeight: -0.458, quantity: 0, balanceAfter: { grossWeight: 9.5, netWeight: 9.5, fineWeight: 8.702 } });
    await expectConsistent(a.id);
  });

  it("refuses impossible corrections at request time: weight past the stone, illegal status jumps, no-ops", async () => {
    const a = await receive(w, { grossWeight: 10, stoneWeight: 2 });
    await expect(requestAdjustment(ctx(), { itemId: a.id, reason: "Weighed again today", grossWeight: 1.5 })).rejects.toThrow(/stoneWeight cannot exceed/);
    await expect(requestAdjustment(ctx(), { itemId: a.id, reason: "Weighed again today", stoneWeight: 10 })).rejects.toThrow(/net weight must be positive/);
    await expect(requestAdjustment(ctx(), { itemId: a.id, reason: "Trying to resurrect it", toStatus: "SOLD" })).resolves.toBeDefined(); // AVAILABLE→SOLD is legal
    const sold = await receive(w);
    await sellItems(ctx(), { itemIds: [sold.id], referenceType: "ORDER", referenceId: someOrder() });
    await expect(requestAdjustment(ctx(), { itemId: sold.id, reason: "Putting it back on the shelf", toStatus: "AVAILABLE" })).rejects.toMatchObject({ code: "ILLEGAL_TRANSITION" });
    await expect(requestAdjustment(ctx(), { itemId: a.id, reason: "Status is already right", toStatus: "AVAILABLE" })).rejects.toThrow(/already AVAILABLE/);
  });

  it("refuses to apply a stale request: if the piece moved since, the approval fails and the request stays open", async () => {
    const a = await receive(w);
    const adj = await requestAdjustment(ctx(), { itemId: a.id, reason: "Cracked stone found at counter", toStatus: "DAMAGED" });
    await reserveItems(ctx(), { itemIds: [a.id], referenceId: someOrder() }); // moved on since the request
    await expect(approveAdjustment(ctx(), adj.id)).rejects.toMatchObject({ code: "CONCURRENT_MODIFICATION" });
    expect((await StockAdjustmentModel.findById(adj.id).lean())!.status).toBe("PENDING");
    expect((await fresh(a.id)).status).toBe("RESERVED");
  });

  it("rejection closes the request without touching stock; a decided request can't be decided again", async () => {
    const a = await receive(w);
    const adj = await requestAdjustment(ctx(), { itemId: a.id, reason: "Cracked stone found at counter", toStatus: "DAMAGED" });
    const before = await counts();
    const rejected = await rejectAdjustment(ctx(), adj.id, "Photos show it is fine");
    expect(rejected).toMatchObject({ status: "REJECTED", decisionNote: "Photos show it is fine" });
    expect(await counts()).toEqual(before);
    await expect(approveAdjustment(ctx(), adj.id)).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(rejectAdjustment(ctx(), adj.id)).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("approving twice at once applies it exactly once", async () => {
    const a = await receive(w);
    const adj = await requestAdjustment(ctx(), { itemId: a.id, reason: "Cracked stone found at counter", toStatus: "DAMAGED" });
    const results = await Promise.allSettled(Array.from({ length: 5 }, () => approveAdjustment(ctx(), adj.id)));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await ledger(a.id)).filter((e) => e.movementType === "ADJUSTMENT")).toHaveLength(1);
    await expectConsistent(a.id);
  });

  it("write-offs use their own movement types: SCRAP, then MELTING; nothing comes back from melting", async () => {
    const a = await receive(w);
    await approveAdjustment(ctx(), (await requestAdjustment(ctx(), { itemId: a.id, reason: "Beyond repair, scrapping", toStatus: "SCRAP" })).id);
    expect((await ledger(a.id)).at(-1)).toMatchObject({ movementType: "SCRAP", toStatus: "SCRAP" });
    await approveAdjustment(ctx(), (await requestAdjustment(ctx(), { itemId: a.id, reason: "Sent for melting", toStatus: "MELTING" })).id);
    expect((await ledger(a.id)).at(-1)).toMatchObject({ movementType: "MELTING", toStatus: "MELTING" });
    await expect(requestAdjustment(ctx(), { itemId: a.id, reason: "Trying to bring it back", toStatus: "AVAILABLE" })).rejects.toMatchObject({ code: "ILLEGAL_TRANSITION" });
    await expectConsistent(a.id);
  });
});

// ---------------------------------------------------------------------------------------------
describe("negative stock", () => {
  async function batch(qty = 100, grams = 100) {
    const { item } = await receiveNewInventoryItem({
      item: { itemCode: `RAW-${Math.random().toString(36).slice(2, 7)}`, type: "RAW_MATERIAL", serialization: "BATCH", grossWeight: grams, stoneWeight: 0, metalId: w.gold, purity: "24K", locationId: w.loc.vault, cost: 600_000, quantity: qty } as never,
      performedBy: someUser(), channel: "ERP", referenceType: "MANUAL",
    });
    return item;
  }
  const take = (id: string, q: number, g: number) =>
    postInventoryTransaction({ type: "ADJUSTMENT", channel: "ERP", referenceType: "ADJUSTMENT", performedBy: someUser(), reason: "Wastage", lines: [{ itemId: id, quantityDelta: -q, weightDelta: -g }] });

  it("won't take more quantity or weight than is on hand, and writes nothing when it refuses", async () => {
    const b = await batch(100, 100);
    const before = await counts();
    await expect(take(b.id, 101, 10)).rejects.toMatchObject({ code: "INSUFFICIENT_STOCK" });
    await expect(take(b.id, 10, 100.001)).rejects.toMatchObject({ code: "INSUFFICIENT_STOCK" });
    expect(await counts()).toEqual(before);
    expect(await fresh(b.id)).toMatchObject({ quantity: 100, grossWeight: 100 });
  });

  it("allows drawing a batch down to exactly zero, and then refuses anything more", async () => {
    const b = await batch(10, 50);
    await take(b.id, 10, 50);
    expect(await fresh(b.id)).toMatchObject({ quantity: 0, grossWeight: 0, netWeight: 0, fineWeight: 0 });
    await expect(take(b.id, 1, 0.001)).rejects.toMatchObject({ code: "INSUFFICIENT_STOCK" });
    await expectConsistent(b.id);
  });

  it("is all-or-nothing when only one line of a multi-line movement would go negative", async () => {
    const [ok, low] = [await batch(100, 100), await batch(5, 5)];
    const before = await counts();
    await expect(postInventoryTransaction({ type: "ADJUSTMENT", channel: "ERP", referenceType: "ADJUSTMENT", performedBy: someUser(), lines: [{ itemId: ok.id, quantityDelta: -10, weightDelta: -10 }, { itemId: low.id, quantityDelta: -6, weightDelta: -6 }] })).rejects.toMatchObject({ code: "INSUFFICIENT_STOCK" });
    expect(await fresh(ok.id)).toMatchObject({ quantity: 100 });
    expect(await counts()).toEqual(before);
  });

  it("a whole piece can't be sold twice, and a unit piece can't be given a quantity delta", async () => {
    const a = await receive(w);
    await sellItems(ctx(), { itemIds: [a.id], referenceType: "ORDER", referenceId: someOrder() });
    await expect(sellItems(ctx(), { itemIds: [a.id], referenceType: "ORDER", referenceId: someOrder() })).rejects.toMatchObject({ code: "ILLEGAL_TRANSITION" });
    const b = await receive(w);
    await expect(postInventoryTransaction({ type: "ADJUSTMENT", channel: "ERP", referenceType: "ADJUSTMENT", performedBy: someUser(), lines: [{ itemId: b.id, quantityDelta: -1 }] })).rejects.toThrow(/whole piece/);
  });

  it("a batch can't be reserved (only individual pieces are held for orders)", async () => {
    const b = await batch();
    await expect(reserveItems(ctx(), { itemIds: [b.id], referenceId: someOrder() })).rejects.toThrow(/only individual pieces/);
  });
});

// ---------------------------------------------------------------------------------------------
describe("concurrent stock operations (real parallel transactions)", () => {
  // The loser retries after the winner commits and then fails on whatever it now sees: not AVAILABLE, held for someone else, or no longer at the source.
  const ALLOWED_LOSER_CODES = ["ILLEGAL_TRANSITION", "CONCURRENT_MODIFICATION", "RESERVED_FOR_OTHER", "CONFLICT"];
  const losers = (rs: PromiseSettledResult<unknown>[]) => rs.filter((r): r is PromiseRejectedResult => r.status === "rejected");

  it("eight simultaneous reservations of one piece: exactly one wins, the rest get a typed conflict", async () => {
    const a = await receive(w);
    const orders = Array.from({ length: 8 }, someOrder);
    const results = await Promise.allSettled(orders.map((o) => reserveItems(ctx(), { itemIds: [a.id], referenceId: o })));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    for (const l of losers(results)) expect(ALLOWED_LOSER_CODES).toContain(l.reason.code);
    const winner = orders[results.findIndex((r) => r.status === "fulfilled")]!;
    const held = await fresh(a.id);
    expect(held.status).toBe("RESERVED");
    expect(String(held.reservation!.referenceId)).toBe(winner);
    expect((await ledger(a.id)).map((e) => e.movementType)).toEqual(["PURCHASE_RECEIPT", "RESERVATION"]);
    await expectConsistent(a.id);
  });

  it("a sale racing a reservation of the same piece: one outcome, consistent state", async () => {
    for (let round = 0; round < 3; round++) {
      const a = await receive(w);
      const results = await Promise.allSettled([
        reserveItems(ctx(), { itemIds: [a.id], referenceId: someOrder() }),
        sellItems(ctx(), { itemIds: [a.id], referenceType: "ORDER", referenceId: someOrder() }),
      ]);
      // Either the reserve won (then the sale is refused: held for another order), or the sale won (reserve refused).
      const wins = results.filter((r) => r.status === "fulfilled").length;
      expect(wins).toBe(1);
      const status = (await fresh(a.id)).status;
      expect(["RESERVED", "SOLD"]).toContain(status);
      expect((await ledger(a.id)).length).toBe(2);
      await expectConsistent(a.id);
    }
  });

  it("two transfers dispatching the same piece to different places: one dispatch, one transfer record, no orphan", async () => {
    const a = await receive(w);
    const results = await Promise.allSettled([
      createTransfer(ctx(), { fromLocationId: w.loc.counter, toLocationId: w.loc.warehouse, itemIds: [a.id] }),
      createTransfer(ctx(), { fromLocationId: w.loc.counter, toLocationId: w.loc.store2, itemIds: [a.id] }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    for (const l of losers(results)) expect(ALLOWED_LOSER_CODES).toContain(l.reason.code);
    expect(await StockTransferModel.countDocuments()).toBe(1);
    expect((await ledger(a.id)).filter((e) => e.movementType === "TRANSFER_OUT")).toHaveLength(1);
    expect((await fresh(a.id)).status).toBe("IN_TRANSIT");
    await expectConsistent(a.id);
  });

  it("receiving the same transfer twice at once completes it once", async () => {
    const a = await receive(w);
    const t = await createTransfer(ctx(), { fromLocationId: w.loc.counter, toLocationId: w.loc.warehouse, itemIds: [a.id] });
    const results = await Promise.allSettled([receiveTransfer(ctx(), t.id), receiveTransfer(ctx(), t.id), cancelTransfer(ctx(), t.id)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await ledger(a.id)).filter((e) => e.movementType === "TRANSFER_IN")).toHaveLength(1);
    await expectConsistent(a.id);
  });

  it("twelve concurrent withdrawals of 10 from a 100-unit batch: exactly ten succeed and the balance never goes negative", async () => {
    const { item: b } = await receiveNewInventoryItem({
      item: { itemCode: "RAW-RACE", type: "RAW_MATERIAL", serialization: "BATCH", grossWeight: 100, stoneWeight: 0, metalId: w.gold, purity: "24K", locationId: w.loc.vault, cost: 1, quantity: 100 } as never,
      performedBy: someUser(), channel: "ERP", referenceType: "MANUAL",
    });
    const results = await Promise.allSettled(
      Array.from({ length: 12 }, () => postInventoryTransaction({ type: "ADJUSTMENT", channel: "ERP", referenceType: "ADJUSTMENT", performedBy: someUser(), lines: [{ itemId: b.id, quantityDelta: -10, weightDelta: -10 }] }))
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(10);
    for (const l of losers(results)) expect(l.reason.code).toBe("INSUFFICIENT_STOCK");
    expect(await fresh(b.id)).toMatchObject({ quantity: 0, grossWeight: 0, ledgerSeq: 11 });
    const entries = await ledger(b.id);
    expect(entries.map((e) => e.sequence)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]); // gap-free, no duplicates
    expect(Math.min(...entries.map((e) => e.balanceAfter.quantity))).toBe(0);
    await expectConsistent(b.id);
  });

  it("does not serialise unrelated pieces: twenty different pieces reserved in parallel all succeed", async () => {
    const items = await Promise.all(Array.from({ length: 20 }, () => receive(w)));
    const results = await Promise.allSettled(items.map((i) => reserveItems(ctx(), { itemIds: [i.id], referenceId: someOrder() })));
    expect(losers(results).map((l) => l.reason.message)).toEqual([]);
    expect(await InventoryItemModel.countDocuments({ status: "RESERVED" })).toBe(20);
  });

  it("interleaved operations on the same pieces leave the ledger and the cache in agreement", async () => {
    const items = await Promise.all(Array.from({ length: 6 }, () => receive(w)));
    const ids = items.map((i) => i.id);
    await Promise.allSettled(
      ids.flatMap((id) => {
        const o = someOrder();
        return [
          reserveItems(ctx(), { itemIds: [id], referenceId: o }),
          releaseItems(ctx(), { itemIds: [id], referenceId: o }),
          sellItems(ctx(), { itemIds: [id], referenceType: "ORDER", referenceId: o }),
          createTransfer(ctx(), { fromLocationId: w.loc.counter, toLocationId: w.loc.warehouse, itemIds: [id] }),
        ];
      })
    );
    const report = await reconcileAll();
    expect(report.checked).toBe(6);
    expect(report.mismatches).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
describe("history & integrity", () => {
  it("every step of a piece's life is in the ledger, in order, gap-free, chained status to status", async () => {
    const a = await receive(w);
    const order = someOrder();
    await movePartner(ctx(), { type: "HALLMARKING_OUT", itemIds: [a.id], destinationLocationId: w.loc.hallmark });
    await movePartner(ctx(), { type: "HALLMARKING_IN", itemIds: [a.id], destinationLocationId: w.loc.counter, hallmarkResults: [{ itemId: a.id, huid: "LIFE01" }] });
    const t = await createTransfer(ctx(), { fromLocationId: w.loc.counter, toLocationId: w.loc.store2, itemIds: [a.id] });
    await receiveTransfer(ctx(), t.id);
    await reserveItems(ctx(), { itemIds: [a.id], referenceId: order });
    await sellItems(ctx(), { itemIds: [a.id], referenceType: "ORDER", referenceId: order });
    await returnItems(ctx(), { itemIds: [a.id], destinationLocationId: w.loc.store2, referenceId: order, referenceType: "ORDER" });

    const entries = await ledger(a.id);
    expect(entries.map((e) => [e.sequence, e.movementType, e.fromStatus ?? "—", e.toStatus])).toEqual([
      [1, "PURCHASE_RECEIPT", "—", "AVAILABLE"],
      [2, "HALLMARKING_OUT", "AVAILABLE", "HALLMARKING"],
      [3, "HALLMARKING_IN", "HALLMARKING", "AVAILABLE"],
      [4, "TRANSFER_OUT", "AVAILABLE", "IN_TRANSIT"],
      [5, "TRANSFER_IN", "IN_TRANSIT", "AVAILABLE"],
      [6, "RESERVATION", "AVAILABLE", "RESERVED"],
      [7, "SALE", "RESERVED", "SOLD"],
      [8, "RETURN", "SOLD", "RETURNED"],
    ]);
    // Where was it at each point? Read straight off the ledger.
    expect(entries.map((e) => e.destinationLocationId)).toEqual([w.loc.counter, w.loc.hallmark, w.loc.counter, w.loc.store2, w.loc.store2, w.loc.store2, w.loc.store2, w.loc.store2]);
    await expectConsistent(a.id);
    expect(await reconcileAll()).toMatchObject({ checked: 1, mismatches: [] });
  });

  it("every ledger entry carries its business event: who, why, and what it referred to", async () => {
    const a = await receive(w);
    const by = someUser();
    const order = someOrder();
    await reserveItems({ performedBy: by }, { itemIds: [a.id], referenceId: order, reason: "Customer on the phone" });
    const entry = (await ledger(a.id)).at(-1)!;
    const tx = await TransactionModel.findById(entry.transactionId).lean();
    expect(tx).toMatchObject({ type: "RESERVATION", referenceType: "ORDER", reason: "Customer on the phone", channel: "ERP" });
    expect(String(tx!.performedBy)).toBe(by);
    expect(String(tx!.referenceId)).toBe(order);
  });

  it("the ledger is append-only: entries and transactions can't be edited or deleted", async () => {
    const a = await receive(w);
    const entry = (await InventoryLedgerModel.findOne({ itemId: a.id }))!;
    await expect(InventoryLedgerModel.updateOne({ _id: entry._id }, { $set: { quantity: 99 } })).rejects.toThrow(/append-only/i);
    await expect(InventoryLedgerModel.deleteOne({ _id: entry._id })).rejects.toThrow(/append-only/i);
    await expect(TransactionModel.deleteMany({})).rejects.toThrow(/append-only/i);
  });

  it("a silent edit of the cached item (bypassing the ledger) is detected by reconciliation", async () => {
    const a = await receive(w);
    await InventoryItemModel.updateOne({ _id: a.id }, { $set: { status: "SOLD" } }); // exactly what the rules forbid
    const r = await reconcileItem(a.id);
    expect(r.ok).toBe(false);
    expect(r.problems.join()).toMatch(/status SOLD but ledger ends at AVAILABLE/);
    expect((await reconcileAll()).mismatches).toHaveLength(1);
  });

  it("no ledger write can claim a slot another entry already holds (per-item sequence is unique)", async () => {
    const a = await receive(w);
    const first = (await InventoryLedgerModel.findOne({ itemId: a.id }).lean())!;
    await expect(InventoryLedgerModel.create({ ...first, _id: undefined, sequence: 1 })).rejects.toThrow(/duplicate key|E11000/i);
  });

  it("createInventoryItem outside a receipt leaves ledgerSeq 0, and the first movement still starts the ledger correctly", async () => {
    const direct = await createInventoryItem({ itemCode: "DIRECT-1", type: "FINISHED_JEWELLERY", grossWeight: 5, metalId: w.gold, purity: "22K", locationId: w.loc.counter, cost: 1 } as never);
    expect(direct.ledgerSeq).toBe(0);
    await reserveItems(ctx(), { itemIds: [direct.id], referenceId: someOrder() });
    expect((await ledger(direct.id))[0]!.sequence).toBe(1);
  });
});
