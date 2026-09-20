import { Types } from "mongoose";
import { describe, expect, it } from "vitest";
import { ImmutableRecordError } from "./errors";
import { TransactionModel } from "../modules/inventory/transaction.model";
import { InventoryLedgerModel } from "../modules/inventory/inventory-ledger.model";
import { MetalRateModel } from "../modules/metals/metal-rate.model";

describe("appendOnlyPlugin (business-rules.md §2.1: InventoryLedger/Transaction are append-only)", () => {
  it("allows creating a new InventoryLedger entry", async () => {
    const doc = await InventoryLedgerModel.create({
      transactionId: new Types.ObjectId(),
      itemId: new Types.ObjectId(),
      movementType: "ADJUSTMENT",
      sequence: 1,
      balanceAfter: { quantity: 1, grossWeight: 1, stoneWeight: 0, netWeight: 1, fineWeight: 1 },
      quantity: 0,
      grossWeight: 0,
      netWeight: 0,
      fineWeight: 0,
      toStatus: "AVAILABLE",
      destinationLocationId: new Types.ObjectId(),
    });
    expect(doc._id).toBeDefined();
  });

  it("rejects updateOne on an existing InventoryLedger entry", async () => {
    const doc = await InventoryLedgerModel.create({
      transactionId: new Types.ObjectId(),
      itemId: new Types.ObjectId(),
      movementType: "ADJUSTMENT",
      sequence: 1,
      balanceAfter: { quantity: 1, grossWeight: 1, stoneWeight: 0, netWeight: 1, fineWeight: 1 },
      quantity: 0,
      grossWeight: 0,
      netWeight: 0,
      fineWeight: 0,
      toStatus: "AVAILABLE",
      destinationLocationId: new Types.ObjectId(),
    });

    await expect(InventoryLedgerModel.updateOne({ _id: doc._id }, { quantity: 999 })).rejects.toThrow(ImmutableRecordError);
  });

  it("rejects re-saving an existing InventoryLedger document", async () => {
    const doc = await InventoryLedgerModel.create({
      transactionId: new Types.ObjectId(),
      itemId: new Types.ObjectId(),
      movementType: "ADJUSTMENT",
      sequence: 1,
      balanceAfter: { quantity: 1, grossWeight: 1, stoneWeight: 0, netWeight: 1, fineWeight: 1 },
      quantity: 0,
      grossWeight: 0,
      netWeight: 0,
      fineWeight: 0,
      toStatus: "AVAILABLE",
      destinationLocationId: new Types.ObjectId(),
    });

    doc.quantity = 42;
    await expect(doc.save()).rejects.toThrow(ImmutableRecordError);
  });

  it("rejects deleteOne on an existing InventoryLedger entry", async () => {
    const doc = await InventoryLedgerModel.create({
      transactionId: new Types.ObjectId(),
      itemId: new Types.ObjectId(),
      movementType: "ADJUSTMENT",
      sequence: 1,
      balanceAfter: { quantity: 1, grossWeight: 1, stoneWeight: 0, netWeight: 1, fineWeight: 1 },
      quantity: 0,
      grossWeight: 0,
      netWeight: 0,
      fineWeight: 0,
      toStatus: "AVAILABLE",
      destinationLocationId: new Types.ObjectId(),
    });

    await expect(InventoryLedgerModel.deleteOne({ _id: doc._id })).rejects.toThrow(ImmutableRecordError);
  });

  it("rejects updating a Transaction after creation", async () => {
    const doc = await TransactionModel.create({
      type: "SALE",
      channel: "ERP",
      referenceType: "MANUAL",
      performedBy: new Types.ObjectId(),
    });

    await expect(TransactionModel.updateOne({ _id: doc._id }, { reason: "changed my mind" })).rejects.toThrow(ImmutableRecordError);
  });

  it("rejects updating a MetalRate after creation — a correction is a new rate, not an edit", async () => {
    const doc = await MetalRateModel.create({
      metalId: new Types.ObjectId(),
      purity: "22K",
      ratePerGram: 6842,
      effectiveFrom: new Date(),
      source: "MANUAL",
    });

    await expect(MetalRateModel.updateOne({ _id: doc._id }, { ratePerGram: 7000 })).rejects.toThrow(ImmutableRecordError);
  });
});
