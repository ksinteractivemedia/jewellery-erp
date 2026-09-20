import { Types } from "mongoose";
import type { InventoryItem } from "@jewellery/types";
import { ProductModel } from "../src/modules/catalog/product.model";
import {
  approveAdjustment,
  cancelTransfer,
  createTransfer,
  inspectReturnedItems,
  movePartner,
  receiveTransfer,
  rejectAdjustment,
  releaseExpiredReservations,
  requestAdjustment,
  reserveItems,
  returnItems,
  sellItems,
} from "../src/modules/inventory/stock-operations";
import { receiveNewInventoryItem } from "../src/modules/inventory/inventory-transaction.service";
import { MetalModel } from "../src/modules/metals/metal.model";
import { createMetalRate } from "../src/modules/metals/metal-rate.repository";
import { createBranch } from "../src/modules/organization/branch.repository";
import { createCompany } from "../src/modules/organization/company.repository";
import { createLocation } from "../src/modules/organization/location.repository";

/**
 * DEVELOPMENT ONLY — a believable shop floor for the inventory screens: locations of every type, today's
 * metal rates, ~70 pieces of the seeded catalogue spread across them, and a history that exercises every
 * status. Everything goes through the same services the API uses (so the ledger is real and reconciles),
 * never through direct writes. Nothing under src/ imports this; only scripts/dev-memory.ts does.
 */
if (process.env.NODE_ENV === "production") throw new Error("inventory seed data must never load in production");

const address = { line1: "12 Zaveri Bazaar", city: "Mumbai", state: "Maharashtra", postalCode: "400002", country: "India" };

/** Per-gram paise for the quoted purity of each metal, as of "today". */
const RATES: Record<string, { purity: string; ratePerGram: number }> = {
  GOLD: { purity: "24K", ratePerGram: 7_250_00 },
  SILVER: { purity: "999", ratePerGram: 98_00 },
  PLATINUM: { purity: "950", ratePerGram: 3_150_00 },
};

// Small deterministic generator, so a reseed looks the same every time.
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}
const HUID_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789";

export interface InventorySeedActors {
  inventoryManager: string;
  storeManager: string;
  warehouseManager?: string;
}

export async function seedInventory(actors: InventorySeedActors) {
  const rand = rng(20260920);
  const inv = { performedBy: actors.inventoryManager };
  const store = { performedBy: actors.storeManager };
  const wh = { performedBy: actors.warehouseManager ?? actors.inventoryManager };

  // ---- locations ----------------------------------------------------------------------------
  const company = await createCompany({ name: "Suvarna Jewellers", legalName: "Suvarna Jewellers Pvt. Ltd.", address });
  const main = await createBranch({ companyId: company.id, name: "Zaveri Bazaar Flagship", code: "ZAV", address });
  const andheri = await createBranch({ companyId: company.id, name: "Andheri Store", code: "AND", address: { ...address, line1: "8 Link Road, Andheri West", postalCode: "400053" } });
  const mk = async (branchId: string, name: string, code: string, type: Parameters<typeof createLocation>[0]["type"]) => (await createLocation({ branchId, name, code, type })).id;
  const loc = {
    counter: await mk(main.id, "Showroom Counter", "ZAV-CTR", "COUNTER"),
    vault: await mk(main.id, "Main Vault", "ZAV-VLT", "VAULT"),
    warehouse: await mk(main.id, "Back Warehouse", "ZAV-WH", "WAREHOUSE"),
    andheri: await mk(andheri.id, "Andheri Showroom", "AND-SHW", "STORE"),
    workshop: await mk(main.id, "In-house Workshop", "ZAV-MFG", "MANUFACTURING_UNIT"),
    jobworker: await mk(main.id, "Ramesh Karigar (job worker)", "JW-RAMESH", "JOB_WORKER"),
    hallmark: await mk(main.id, "BIS Hallmarking Centre, Opera House", "HM-OPERA", "HALLMARKING_CENTER"),
    repair: await mk(main.id, "Sharma Repairs", "RP-SHARMA", "REPAIR_CENTER"),
  };

  // ---- metal rates (drive the valuation on the item detail page) -------------------------------
  const metals = await MetalModel.find().lean();
  const metalByCode = new Map(metals.map((m) => [m.code, m]));
  for (const [code, r] of Object.entries(RATES)) {
    const metal = metalByCode.get(code);
    if (metal) await createMetalRate({ metalId: String(metal._id), purity: r.purity, ratePerGram: r.ratePerGram, effectiveFrom: new Date(Date.now() - 6 * 3600_000), source: "MANUAL" } as never);
  }

  // ---- pieces --------------------------------------------------------------------------------
  const products = await ProductModel.find({ isActive: true }).sort({ sku: 1 }).lean();
  const usedHuids = new Set<string>();
  const newHuid = () => {
    for (;;) {
      const h = Array.from({ length: 6 }, () => HUID_CHARS[Math.floor(rand() * HUID_CHARS.length)]).join("");
      if (!usedHuids.has(h)) return usedHuids.add(h), h;
    }
  };

  const pieces: InventoryItem[] = [];
  let barcode = 8_901_000_000_000;
  const spread = [loc.counter, loc.counter, loc.counter, loc.vault, loc.warehouse];
  for (const p of products) {
    const metal = [...metalByCode.values()].find((m) => String(m._id) === String(p.metalId));
    if (!metal || !p.purity) continue;
    const isCoinOrBar = /^(GLD|SLV)-CIN/.test(p.sku);
    const count = isCoinOrBar ? 3 : /RNG|BNG/.test(p.sku) ? 2 : 1 + (rand() < 0.4 ? 1 : 0);
    for (let n = 0; n < count; n++) {
      const base = p.defaultGrossWeight ?? 5;
      const gross = Math.round(base * (0.97 + rand() * 0.06) * 1000) / 1000;
      const stone = isCoinOrBar || /Solitaire|Diamond|Ruby|Polki|Kundan/i.test(p.name) ? Math.round(gross * 0.04 * 1000) / 1000 : 0;
      const fineness = metal.purityOptions.find((o) => o.code === p.purity)?.fineness ?? 0.9;
      const rate = RATES[metal.code]!;
      const rateFineness = metal.purityOptions.find((o) => o.code === rate.purity)?.fineness ?? 1;
      const metalCost = ((gross - stone) * fineness * rate.ratePerGram) / rateFineness;
      const { item } = await receiveNewInventoryItem({
        item: {
          type: "FINISHED_JEWELLERY",
          productId: String(p._id),
          metalId: String(p.metalId),
          purity: p.purity,
          grossWeight: gross,
          stoneWeight: stone,
          cost: Math.round(metalCost * (1.05 + rand() * 0.06) + stone * 1_200_00),
          locationId: spread[Math.floor(rand() * spread.length)]!,
          barcode: String(++barcode),
          ...(metal.code === "GOLD" && rand() < 0.65 ? { huid: newHuid() } : {}),
        },
        performedBy: actors.warehouseManager ?? actors.inventoryManager,
        channel: "ERP",
        referenceType: "GOODS_RECEIPT",
        reason: "Opening stock",
      });
      pieces.push(item);
    }
  }
  // Raw material and a semi-finished lot (batches), for the non-jewellery kinds.
  const gold = metalByCode.get("GOLD")!;
  for (const [purity, grams, cost] of [["24K", 250, 250 * 7_250_00], ["22K", 120, 120 * 6_650_00]] as const) {
    await receiveNewInventoryItem({
      item: { type: "RAW_MATERIAL", serialization: "BATCH", metalId: String(gold._id), purity, grossWeight: grams, stoneWeight: 0, cost, quantity: grams, locationId: loc.vault, itemCode: `RAW-GOLD-${purity}` },
      performedBy: inv.performedBy, channel: "ERP", referenceType: "SUPPLIER_PURCHASE_ORDER", reason: "Bullion purchase",
    });
  }

  // ---- give them a history -------------------------------------------------------------------
  const avail = pieces.filter((p) => p.status === "AVAILABLE");
  const take = (n: number) => avail.splice(0, n);
  /** Pieces that have no HUID yet — the ones that genuinely go to the hallmarking centre. */
  const takeUnmarked = (n: number) => {
    const out: InventoryItem[] = [];
    for (let i = 0; i < avail.length && out.length < n; ) (avail[i]!.huid ? i++ : out.push(...avail.splice(i, 1)));
    return out;
  };
  const ids = (xs: InventoryItem[]) => xs.map((x) => x.id);
  const order = () => new Types.ObjectId().toString();
  const oneEach = async <T>(xs: InventoryItem[], fn: (x: InventoryItem, i: number) => Promise<T>) => { for (const [i, x] of xs.entries()) await fn(x, i); };

  // Held for orders (some lapsed, some open-ended) and sold.
  await oneEach(take(5), (x, i) => reserveItems(store, { itemIds: [x.id], referenceId: order(), expiresAt: i === 0 ? new Date(Date.now() + 90 * 60_000) : i === 1 ? undefined : new Date(Date.now() + 26 * 3600_000) }));
  const lapsed = take(1)[0]!;
  await reserveItems(store, { itemIds: [lapsed.id], referenceId: order(), expiresAt: new Date(Date.now() - 60_000) });
  await releaseExpiredReservations(); // ledger shows the system releasing it
  const sold = take(8);
  const soldOrders = sold.map(order);
  await oneEach(sold, (x, i) => sellItems(store, { itemIds: [x.id], referenceType: "ORDER", referenceId: soldOrders[i]! }));
  // Returns: two awaiting inspection, one already restocked, one written down as damaged.
  await oneEach(sold.slice(0, 4), (x, i) => returnItems(store, { itemIds: [x.id], destinationLocationId: loc.counter, referenceType: "ORDER", referenceId: soldOrders[i]!, reason: ["Wrong size", "Gift returned", "Changed mind", "Clasp defect"][i] }));
  await inspectReturnedItems(store, { itemIds: [sold[0]!.id], outcome: "AVAILABLE", destinationLocationId: loc.counter });
  await inspectReturnedItems(store, { itemIds: [sold[3]!.id], outcome: "DAMAGED", destinationLocationId: loc.counter, reason: "Clasp broken on return" });

  // Custody with partners.
  await movePartner(inv, { type: "HALLMARKING_OUT", itemIds: ids(takeUnmarked(3)), destinationLocationId: loc.hallmark, reason: "Batch for BIS hallmarking" });
  const back = takeUnmarked(2);
  await movePartner(inv, { type: "HALLMARKING_OUT", itemIds: ids(back), destinationLocationId: loc.hallmark });
  await movePartner(inv, { type: "HALLMARKING_IN", itemIds: ids(back), destinationLocationId: loc.vault, hallmarkResults: back.map((b) => ({ itemId: b.id, huid: newHuid() })) });
  await movePartner(inv, { type: "JOBWORK_ISSUE", itemIds: ids(take(3)), destinationLocationId: loc.jobworker, reason: "Stone setting — Ramesh" });
  await movePartner(inv, { type: "REPAIR_OUT", itemIds: ids(take(2)), destinationLocationId: loc.repair, reason: "Resizing and polish" });
  await movePartner(inv, { type: "MANUFACTURING_ISSUE", itemIds: ids(take(2)), destinationLocationId: loc.workshop, reason: "Rework for festive collection" });

  // Transfers: one on the road, one done, one cancelled.
  const onRoad = await createTransfer(wh, { fromLocationId: loc.warehouse, toLocationId: loc.andheri, itemIds: ids(avail.filter((p) => p.locationId === loc.warehouse).slice(0, 4)), notes: "Weekly restock for Andheri" });
  const doneItems = avail.filter((p) => p.locationId === loc.counter && !onRoad.lines.some((l) => l.itemId === p.id)).slice(0, 3);
  const done = await createTransfer(inv, { fromLocationId: loc.counter, toLocationId: loc.vault, itemIds: ids(doneItems), notes: "End-of-day to vault" });
  await receiveTransfer(inv, done.id);
  const wrongBag = avail.filter((p) => p.locationId === loc.vault && !doneItems.some((d) => d.id === p.id)).slice(0, 2);
  if (wrongBag.length) {
    const cancelled = await createTransfer(inv, { fromLocationId: loc.vault, toLocationId: loc.warehouse, itemIds: ids(wrongBag), notes: "Sent by mistake" });
    await cancelTransfer(inv, cancelled.id, "Wrong bag");
  }

  // Adjustments awaiting a decision, one done, one rejected, one gone stale.
  const candidates = avail.filter((p) => p.status === "AVAILABLE" && !onRoad.lines.some((l) => l.itemId === p.id) && !doneItems.some((d) => d.id === p.id));
  const [w1, w2, w3, w4] = await Promise.all(candidates.slice(0, 4).map(async (p) => (await import("../src/modules/inventory/inventory-item.repository")).requireInventoryItemById(p.id)));
  if (w1 && w2 && w3 && w4) {
    await requestAdjustment(store, { itemId: w1.id, reason: "Re-weighed on the calibrated scale after cleaning", grossWeight: Math.round((w1.grossWeight - 0.12) * 1000) / 1000 });
    await requestAdjustment(store, { itemId: w2.id, reason: "Stone dislodged and lost — piece is now damaged", toStatus: "DAMAGED" });
    const done = await requestAdjustment(store, { itemId: w3.id, reason: "Re-weighed at stock-take", grossWeight: Math.round((w3.grossWeight + 0.05) * 1000) / 1000 });
    await approveAdjustment(inv, done.id, "Verified against stock-take sheet");
    const no = await requestAdjustment(store, { itemId: w4.id, reason: "Looks scratched under the counter light", toStatus: "DAMAGED" });
    await rejectAdjustment(inv, no.id, "Inspected — polish only, not damaged");
  }
  const late = candidates[4];
  if (late) {
    await requestAdjustment(store, { itemId: late.id, reason: "Suspected missing stone, please write down", toStatus: "DAMAGED" });
    await reserveItems(store, { itemIds: [late.id], referenceId: order() }); // moves on afterwards → the request is now stale
  }

  return { locations: Object.keys(loc).length, pieces: pieces.length + 2 };
}
