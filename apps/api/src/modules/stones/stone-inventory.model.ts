import { Schema, Types, model, type HydratedDocument, type Model } from "mongoose";
import type { StoneInventoryLot } from "@jewellery/types";
import { baseSchemaOptions } from "../../shared/mongoose.helpers";

export type StoneInventoryAttrs = Omit<StoneInventoryLot, "id" | "stoneId" | "locationId"> & {
  stoneId: Types.ObjectId;
  locationId: Types.ObjectId;
};
export type StoneInventoryDocument = HydratedDocument<StoneInventoryAttrs>;

const STATUSES = ["AVAILABLE", "RESERVED", "ISSUED_TO_MANUFACTURING", "SOLD", "RETURNED", "DAMAGED"] as const;

const stoneInventorySchema = new Schema<StoneInventoryAttrs>(
  {
    stoneId: { type: Schema.Types.ObjectId, ref: "Stone", required: true },
    itemCode: { type: String, required: true, unique: true, uppercase: true, trim: true },
    shape: String,
    size: String,
    caratWeight: { type: Number, required: true, min: 0 },
    clarity: String,
    color: String,
    certificateNumber: String,
    certificateAuthority: String,
    cost: { type: Number, required: true, min: 0 },
    quantity: { type: Number, required: true, min: 0 },
    unit: { type: String, enum: ["CARAT", "GRAM", "PIECE"], required: true },
    locationId: { type: Schema.Types.ObjectId, ref: "Location", required: true },
    status: { type: String, enum: STATUSES, default: "AVAILABLE" },
  },
  baseSchemaOptions<StoneInventoryAttrs>()
);

stoneInventorySchema.index({ status: 1, locationId: 1 });
stoneInventorySchema.index({ stoneId: 1 });

export const StoneInventoryModel: Model<StoneInventoryAttrs> = model<StoneInventoryAttrs>("StoneInventory", stoneInventorySchema);
