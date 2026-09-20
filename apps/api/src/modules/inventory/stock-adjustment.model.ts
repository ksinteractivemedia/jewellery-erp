import { Schema, Types, model, type HydratedDocument, type Model } from "mongoose";
import type { StockAdjustment } from "@jewellery/types";
import { baseSchemaOptions } from "../../shared/mongoose.helpers";

export type StockAdjustmentAttrs = Omit<StockAdjustment, "id" | "itemId" | "requestedBy" | "decidedBy" | "transactionId"> & {
  itemId: Types.ObjectId;
  requestedBy: Types.ObjectId;
  decidedBy?: Types.ObjectId;
  transactionId?: Types.ObjectId;
};
export type StockAdjustmentDocument = HydratedDocument<StockAdjustmentAttrs>;

const STATUSES = [
  "AVAILABLE", "RESERVED", "SOLD", "RETURNED", "DAMAGED", "UNDER_REPAIR",
  "IN_MANUFACTURING", "WITH_JOB_WORKER", "IN_TRANSIT", "HALLMARKING", "SCRAP", "MELTING",
] as const;

const stockAdjustmentSchema = new Schema<StockAdjustmentAttrs>(
  {
    adjustmentNo: { type: String, required: true, unique: true },
    itemId: { type: Schema.Types.ObjectId, ref: "InventoryItem", required: true },
    itemCode: { type: String, required: true },
    status: { type: String, enum: ["PENDING", "APPROVED", "REJECTED"], default: "PENDING" },
    reason: { type: String, required: true },
    expectedLedgerSeq: { type: Number, required: true },
    toStatus: { type: String, enum: STATUSES },
    grossWeight: { type: Number, min: 0 },
    stoneWeight: { type: Number, min: 0 },
    quantityDelta: Number,
    weightDelta: Number,
    requestedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    decidedBy: { type: Schema.Types.ObjectId, ref: "User" },
    decidedAt: Date,
    decisionNote: String,
    transactionId: { type: Schema.Types.ObjectId, ref: "Transaction" },
  },
  baseSchemaOptions<StockAdjustmentAttrs>()
);

stockAdjustmentSchema.index({ status: 1, createdAt: -1 });
stockAdjustmentSchema.index({ itemId: 1, createdAt: -1 });

export const StockAdjustmentModel: Model<StockAdjustmentAttrs> = model<StockAdjustmentAttrs>("StockAdjustment", stockAdjustmentSchema);
