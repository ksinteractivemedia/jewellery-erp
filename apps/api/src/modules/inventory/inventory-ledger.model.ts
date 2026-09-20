import { Schema, Types, model, type HydratedDocument, type Model } from "mongoose";
import type { InventoryLedgerEntry } from "@jewellery/types";
import { appendOnlyPlugin } from "../../shared/append-only.plugin";
import { createdAtOnlySchemaOptions } from "../../shared/mongoose.helpers";

const MOVEMENT_TYPES = [
  "PURCHASE",
  "GOODS_RECEIPT",
  "SALE",
  "RETURN",
  "EXCHANGE",
  "TRANSFER",
  "ADJUSTMENT",
  "MANUFACTURING_ISSUE",
  "MANUFACTURING_RECEIPT",
  "JOB_WORK_ISSUE",
  "JOB_WORK_RECEIPT",
  "HALLMARKING_OUT",
  "HALLMARKING_IN",
  "REPAIR_OUT",
  "REPAIR_IN",
  "SCRAP",
  "MELTING",
] as const;

const STATUSES = [
  "AVAILABLE",
  "RESERVED",
  "SOLD",
  "RETURNED",
  "DAMAGED",
  "UNDER_REPAIR",
  "IN_MANUFACTURING",
  "WITH_JOB_WORKER",
  "IN_TRANSIT",
  "HALLMARKING",
  "SCRAP",
  "MELTING",
] as const;

export type InventoryLedgerAttrs = Omit<
  InventoryLedgerEntry,
  "id" | "transactionId" | "itemId" | "sourceLocationId" | "destinationLocationId"
> & {
  transactionId: Types.ObjectId;
  itemId: Types.ObjectId;
  sourceLocationId?: Types.ObjectId;
  destinationLocationId?: Types.ObjectId;
};
export type InventoryLedgerDocument = HydratedDocument<InventoryLedgerAttrs>;

const inventoryLedgerSchema = new Schema<InventoryLedgerAttrs>(
  {
    transactionId: { type: Schema.Types.ObjectId, ref: "Transaction", required: true },
    itemId: { type: Schema.Types.ObjectId, ref: "InventoryItem", required: true },
    movementType: { type: String, enum: MOVEMENT_TYPES, required: true },

    quantity: { type: Number, required: true },
    grossWeight: { type: Number, required: true },
    netWeight: { type: Number, required: true },
    fineWeight: { type: Number, required: true },

    fromStatus: { type: String, enum: STATUSES },
    toStatus: { type: String, enum: STATUSES, required: true },
    sourceLocationId: { type: Schema.Types.ObjectId, ref: "Location" },
    destinationLocationId: { type: Schema.Types.ObjectId, ref: "Location" },
  },
  createdAtOnlySchemaOptions<InventoryLedgerAttrs>()
);

// The most common read: "full history for this item, oldest to newest".
inventoryLedgerSchema.index({ itemId: 1, createdAt: 1 });
inventoryLedgerSchema.index({ transactionId: 1 });

inventoryLedgerSchema.plugin(appendOnlyPlugin, { entityName: "InventoryLedger" });

export const InventoryLedgerModel: Model<InventoryLedgerAttrs> = model<InventoryLedgerAttrs>("InventoryLedger", inventoryLedgerSchema);
