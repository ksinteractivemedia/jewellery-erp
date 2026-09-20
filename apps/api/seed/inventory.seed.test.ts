import { Types } from "mongoose";
import { describe, expect, it } from "vitest";
import { InventoryItemModel } from "../src/modules/inventory/inventory-item.model";
import { StockAdjustmentModel } from "../src/modules/inventory/stock-adjustment.model";
import { StockTransferModel } from "../src/modules/inventory/stock-transfer.model";
import { reconcileAll } from "../src/modules/inventory/reconciliation";
import { createMediaService } from "../src/modules/media/media.service";
import { createMemoryStorage } from "../src/modules/media/storage";
import { seedCatalog } from "./catalog.seed";
import { seedInventory } from "./inventory.seed";

describe("dev inventory seed", () => {
  it("builds a coherent shop floor: every piece reconciles with its ledger, and every status/flow the screens show exists", async () => {
    await seedCatalog(createMediaService(createMemoryStorage(), "http://api.test"));
    const id = () => new Types.ObjectId().toString();
    const result = await seedInventory({ inventoryManager: id(), storeManager: id(), warehouseManager: id() });
    expect(result.pieces).toBeGreaterThanOrEqual(60);

    const report = await reconcileAll();
    expect(report.mismatches).toEqual([]);
    expect(report.checked).toBe(await InventoryItemModel.countDocuments());

    const statuses = new Set((await InventoryItemModel.distinct("status")) as string[]);
    for (const s of ["AVAILABLE", "RESERVED", "SOLD", "RETURNED", "DAMAGED", "UNDER_REPAIR", "IN_MANUFACTURING", "WITH_JOB_WORKER", "IN_TRANSIT", "HALLMARKING"]) expect(statuses.has(s), s).toBe(true);
    expect(await InventoryItemModel.countDocuments({ huid: { $exists: true } })).toBeGreaterThan(20);
    expect(await InventoryItemModel.countDocuments({ serialization: "BATCH" })).toBe(2);
    expect((await StockTransferModel.distinct("status")).sort()).toEqual(["CANCELLED", "IN_TRANSIT", "RECEIVED"]);
    expect((await StockAdjustmentModel.distinct("status")).sort()).toEqual(["APPROVED", "PENDING", "REJECTED"]);
    const stale = (await StockAdjustmentModel.find({ status: "PENDING" }).lean()).some((a) => a.expectedLedgerSeq !== undefined);
    expect(stale).toBe(true);
  });
});
