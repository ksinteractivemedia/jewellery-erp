import { Schema, Types, model, type HydratedDocument, type Model } from "mongoose";
import type { PriceList } from "@jewellery/types";
import { baseSchemaOptions } from "../../shared/mongoose.helpers";

export type PriceListAttrs = Omit<PriceList, "id" | "customerGroupId" | "customerId"> & {
  customerGroupId?: Types.ObjectId;
  customerId?: Types.ObjectId;
};
export type PriceListDocument = HydratedDocument<PriceListAttrs>;

const priceListSchema = new Schema<PriceListAttrs>(
  {
    code: { type: String, required: true, uppercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    version: { type: Number, required: true, default: 1, min: 1 },
    customerGroupId: { type: Schema.Types.ObjectId, ref: "CustomerGroup" },
    customerId: { type: Schema.Types.ObjectId, ref: "Customer" },
    channel: { type: String, enum: ["ERP", "B2C", "B2B", "BOTH"], required: true, default: "BOTH" },
    effectiveFrom: { type: Date, required: true },
    effectiveTo: Date,
    isActive: { type: Boolean, default: true },
  },
  baseSchemaOptions<PriceListAttrs>()
);

// One code can have many versions over time, but never two with the same version number.
priceListSchema.index({ code: 1, version: 1 }, { unique: true });
priceListSchema.index({ code: 1, effectiveFrom: -1 });

export const PriceListModel: Model<PriceListAttrs> = model<PriceListAttrs>("PriceList", priceListSchema);
