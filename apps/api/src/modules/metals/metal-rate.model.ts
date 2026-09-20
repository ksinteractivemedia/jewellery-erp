import { Schema, Types, model, type HydratedDocument, type Model } from "mongoose";
import type { MetalRate } from "@jewellery/types";
import { appendOnlyPlugin } from "../../shared/append-only.plugin";
import { createdAtOnlySchemaOptions } from "../../shared/mongoose.helpers";

export type MetalRateAttrs = Omit<MetalRate, "id" | "metalId" | "createdBy"> & {
  metalId: Types.ObjectId;
  createdBy?: Types.ObjectId;
};
export type MetalRateDocument = HydratedDocument<MetalRateAttrs>;

const metalRateSchema = new Schema<MetalRateAttrs>(
  {
    metalId: { type: Schema.Types.ObjectId, ref: "Metal", required: true },
    purity: { type: String, required: true },
    ratePerGram: { type: Number, required: true, min: 0 },
    effectiveFrom: { type: Date, required: true },
    source: { type: String, enum: ["MANUAL", "FEED"], default: "MANUAL" },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  createdAtOnlySchemaOptions<MetalRateAttrs>()
);

// "Current rate" for a metal+purity = the most recent row with effectiveFrom <= now.
metalRateSchema.index({ metalId: 1, purity: 1, effectiveFrom: -1 });

metalRateSchema.plugin(appendOnlyPlugin, { entityName: "MetalRate" });

export const MetalRateModel: Model<MetalRateAttrs> = model<MetalRateAttrs>("MetalRate", metalRateSchema);
