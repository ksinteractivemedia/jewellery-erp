import { Schema, model, type HydratedDocument, type Model } from "mongoose";
import type { Metal } from "@jewellery/types";
import { baseSchemaOptions } from "../../shared/mongoose.helpers";

export type MetalAttrs = Omit<Metal, "id">;
export type MetalDocument = HydratedDocument<MetalAttrs>;

const purityOptionSchema = new Schema(
  {
    code: { type: String, required: true },
    fineness: { type: Number, required: true, min: 0, max: 1 },
    label: String,
    isActive: { type: Boolean, default: true },
  },
  { _id: false }
);

const metalSchema = new Schema<MetalAttrs>(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    symbol: String,
    purityOptions: { type: [purityOptionSchema], default: [] },
    isActive: { type: Boolean, default: true },
  },
  baseSchemaOptions<MetalAttrs>()
);

export const MetalModel: Model<MetalAttrs> = model<MetalAttrs>("Metal", metalSchema);
