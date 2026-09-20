import { Schema, model, type HydratedDocument, type Model } from "mongoose";
import type { ProductCollection } from "@jewellery/types";
import { baseSchemaOptions } from "../../shared/mongoose.helpers";

export type ProductCollectionAttrs = Omit<ProductCollection, "id">;
export type ProductCollectionDocument = HydratedDocument<ProductCollectionAttrs>;

const productCollectionSchema = new Schema<ProductCollectionAttrs>(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    description: String,
    isActive: { type: Boolean, default: true },
  },
  baseSchemaOptions<ProductCollectionAttrs>()
);

export const ProductCollectionModel: Model<ProductCollectionAttrs> = model<ProductCollectionAttrs>("ProductCollection", productCollectionSchema);
