import { Schema, Types, model, type HydratedDocument, type Model } from "mongoose";
import type { StockTransfer } from "@jewellery/types";
import { baseSchemaOptions } from "../../shared/mongoose.helpers";

export type StockTransferAttrs = Omit<StockTransfer, "id" | "fromLocationId" | "toLocationId" | "lines" | "dispatchedBy" | "closedBy"> & {
  fromLocationId: Types.ObjectId;
  toLocationId: Types.ObjectId;
  lines: { itemId: Types.ObjectId; itemCode: string; state: "PENDING" | "RECEIVED" | "RETURNED"; resolvedAt?: Date }[];
  dispatchedBy: Types.ObjectId;
  closedBy?: Types.ObjectId;
};
export type StockTransferDocument = HydratedDocument<StockTransferAttrs>;

const lineSchema = new Schema(
  {
    itemId: { type: Schema.Types.ObjectId, ref: "InventoryItem", required: true },
    itemCode: { type: String, required: true },
    state: { type: String, enum: ["PENDING", "RECEIVED", "RETURNED"], default: "PENDING" },
    resolvedAt: Date,
  },
  { _id: false }
);

const stockTransferSchema = new Schema<StockTransferAttrs>(
  {
    transferNo: { type: String, required: true, unique: true },
    fromLocationId: { type: Schema.Types.ObjectId, ref: "Location", required: true },
    toLocationId: { type: Schema.Types.ObjectId, ref: "Location", required: true },
    status: { type: String, enum: ["IN_TRANSIT", "RECEIVED", "CANCELLED"], default: "IN_TRANSIT" },
    lines: { type: [lineSchema], required: true },
    notes: String,
    dispatchedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    dispatchedAt: { type: Date, required: true },
    closedBy: { type: Schema.Types.ObjectId, ref: "User" },
    closedAt: Date,
  },
  baseSchemaOptions<StockTransferAttrs>()
);

stockTransferSchema.index({ status: 1, dispatchedAt: -1 });
stockTransferSchema.index({ fromLocationId: 1, dispatchedAt: -1 });
stockTransferSchema.index({ toLocationId: 1, dispatchedAt: -1 });
stockTransferSchema.index({ "lines.itemId": 1 });

export const StockTransferModel: Model<StockTransferAttrs> = model<StockTransferAttrs>("StockTransfer", stockTransferSchema);
