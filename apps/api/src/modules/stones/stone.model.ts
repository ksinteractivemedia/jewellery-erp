import { Schema, model, type HydratedDocument, type Model } from "mongoose";
import type { Stone } from "@jewellery/types";
import { baseSchemaOptions } from "../../shared/mongoose.helpers";

export type StoneAttrs = Omit<Stone, "id">;
export type StoneDocument = HydratedDocument<StoneAttrs>;

const stoneSchema = new Schema<StoneAttrs>(
  {
    name: { type: String, required: true, unique: true, trim: true },
    category: { type: String, enum: ["PRECIOUS", "SEMI_PRECIOUS", "ORGANIC"], required: true },
    defaultUnit: { type: String, enum: ["CARAT", "GRAM", "PIECE"], required: true },
    isActive: { type: Boolean, default: true },
  },
  baseSchemaOptions<StoneAttrs>()
);

export const StoneModel: Model<StoneAttrs> = model<StoneAttrs>("Stone", stoneSchema);
