import { Types } from "mongoose";
import { beforeEach, describe, expect, it } from "vitest";
import { createMetal } from "../metals/metal.repository";
import { createLocation } from "../organization/location.repository";
import { createBranch } from "../organization/branch.repository";
import { createCompany } from "../organization/company.repository";
import { requireInventoryItemById } from "./inventory-item.repository";
import { createInventoryItem } from "./inventory-item.service";
import { listLedgerForItem } from "./inventory-ledger.repository";
import { InventoryLedgerModel } from "./inventory-ledger.model";
import { TransactionModel } from "./transaction.model";
import { postInventoryTransaction, receiveNewInventoryItem } from "./inventory-transaction.service";

const performedBy = () => new Types.ObjectId().toString();

async function makeLocation() {
  const company = await createCompany({
    name: "Suvarna Jewellers",
    legalName: "Suvarna Jewellers Pvt. Ltd.",
    address: { line1: "1 MG Road", city: "Mumbai", state: "Maharashtra", postalCode: "400001", country: "India" },
  });
  const branch = await createBranch({
    companyId: company.id,
    name: "Main Store",
    code: "MAIN",
    address: { line1: "1 MG Road", city: "Mumbai", state: "Maharashtra", postalCode: "400001", country: "India" },
  });
  return createLocation({ branchId: branch.id, name: "Main Store Counter", code: "COUNTER-1", type: "COUNTER" });
}

async function makeGoldMetal() {
  return createMetal({
    code: "GOLD",
    name: "Gold",
    purityOptions: [
      { code: "22K", fineness: 0.916, isActive: true },
      { code: "24K", fineness: 0.999, isActive: true },
    ],
  });
}

describe("inventory-transaction.service", () => {
  let locationId: string;
  let metalId: string;

  beforeEach(async () => {
    const [location, metal] = await Promise.all([makeLocation(), makeGoldMetal()]);
    locationId = location.id;
    metalId = metal.id;
  });

  describe("receiveNewInventoryItem", () => {
    it("creates the item and its first PURCHASE_RECEIPT ledger entry atomically, with no prior status/location", async () => {
      const { item, transaction, entry } = await receiveNewInventoryItem({
        item: {
          itemCode: "INV-1001",
          type: "FINISHED_JEWELLERY",
          serialization: "UNIT",
          grossWeight: 18.42,
          stoneWeight: 0,
          metalId,
          purity: "22K",
          locationId,
          cost: 92000,
        } as never,
        performedBy: performedBy(),
        channel: "ERP",
        referenceType: "GOODS_RECEIPT",
      });

      expect(item.status).toBe("AVAILABLE");
      expect(item.netWeight).toBe(18.42);
      expect(item.fineWeight).toBe(16.873); // 18.42 * 0.916, rounded — see weight-calculations.test.ts for the exact math
      expect(transaction.type).toBe("PURCHASE_RECEIPT");
      expect(entry.sequence).toBe(1);
      expect(entry.balanceAfter).toMatchObject({ quantity: 1, grossWeight: 18.42, netWeight: 18.42, fineWeight: 16.873 });
      expect(entry.fromStatus).toBeUndefined();
      expect(entry.sourceLocationId).toBeUndefined();
      expect(entry.destinationLocationId).toBe(locationId);
      expect(entry.itemId).toBe(item.id);
    });
  });

  describe("postInventoryTransaction", () => {
    async function makeAvailableItem() {
      return createInventoryItem({
        itemCode: `INV-${Math.random().toString(36).slice(2, 8)}`,
        type: "FINISHED_JEWELLERY",
        serialization: "UNIT",
        grossWeight: 10,
        stoneWeight: 0,
        metalId,
        purity: "22K",
        locationId,
        cost: 50000,
      } as never);
    }

    it("reserves an AVAILABLE item, posts one ledger entry, and updates the cached status", async () => {
      const item = await makeAvailableItem();
      const by = performedBy();

      const { transaction, entries } = await postInventoryTransaction({
        type: "RESERVATION",
        channel: "B2C",
        referenceType: "ORDER",
        performedBy: by,
        lines: [{ itemId: item.id, reservation: { referenceType: "ORDER", referenceId: new Types.ObjectId().toString() } }],
      } as never);

      expect(entries).toHaveLength(1);
      expect(entries[0].fromStatus).toBe("AVAILABLE");
      expect(entries[0].toStatus).toBe("RESERVED");
      expect(entries[0].movementType).toBe("RESERVATION");
      expect(transaction.performedBy).toBe(by);

      const updated = await requireInventoryItemById(item.id);
      expect(updated.status).toBe("RESERVED");

      const history = await listLedgerForItem(item.id);
      expect(history).toHaveLength(1);
    });

    it("rejects an illegal transition and rolls back — no Transaction or InventoryLedger row is left behind", async () => {
      const item = await makeAvailableItem();

      await expect(
        postInventoryTransaction({
          type: "RETURN",
          channel: "ERP",
          referenceType: "MANUAL",
          performedBy: performedBy(),
          // AVAILABLE -> RETURNED is not a legal transition (business-rules.md §2.5 / status-transitions.ts)
          lines: [{ itemId: item.id, toStatus: "RETURNED" }],
        } as never)
      ).rejects.toThrow(/illegal status transition/i);

      const unchanged = await requireInventoryItemById(item.id);
      expect(unchanged.status).toBe("AVAILABLE");

      expect(await TransactionModel.countDocuments({})).toBe(0);
      expect(await InventoryLedgerModel.countDocuments({})).toBe(0);
    });

    it("applies a weight delta to a BATCH item (raw material issued to manufacturing)", async () => {
      const workshop = await createLocation({ branchId: (await createBranch({ companyId: (await createCompany({ name: "W", legalName: "W Ltd", address: { line1: "1", city: "Mumbai", state: "MH", postalCode: "400001", country: "India" } })).id, name: "Works", code: "WORKS", address: { line1: "1", city: "Mumbai", state: "MH", postalCode: "400001", country: "India" } })).id, name: "Workshop", code: "WORKSHOP", type: "MANUFACTURING_UNIT" });
      const workshopId = workshop.id;
      const bar = await createInventoryItem({
        itemCode: "RAW-GOLD-001",
        type: "RAW_MATERIAL",
        serialization: "BATCH",
        grossWeight: 100,
        stoneWeight: 0,
        metalId,
        purity: "24K",
        locationId,
        cost: 600000,
        quantity: 100,
      } as never);

      const { entries } = await postInventoryTransaction({
        type: "MANUFACTURING_ISSUE",
        channel: "ERP",
        referenceType: "PRODUCTION_ORDER",
        performedBy: performedBy(),
        lines: [{ itemId: bar.id, destinationLocationId: workshopId, weightDelta: -10, quantityDelta: -10 }],
      } as never);

      expect(entries[0].grossWeight).toBe(-10);
      expect(entries[0].fineWeight).toBeCloseTo(-9.99, 5); // -10 * 0.999

      const updated = await requireInventoryItemById(bar.id);
      expect(updated.grossWeight).toBe(90);
      expect(updated.netWeight).toBe(90);
      expect(updated.quantity).toBe(90);
      expect(updated.status).toBe("IN_MANUFACTURING");
    });

    it("rejects posting against a non-existent item", async () => {
      await expect(
        postInventoryTransaction({
          type: "ADJUSTMENT",
          channel: "ERP",
          referenceType: "ADJUSTMENT",
          performedBy: performedBy(),
          lines: [{ itemId: new Types.ObjectId().toString(), toStatus: "DAMAGED" }],
        } as never)
      ).rejects.toThrow(/not found/i);
    });
  });
});
