import { Schema, Types, model, type HydratedDocument, type Model } from "mongoose";
import type { ProductVariant } from "@jewellery/types";
import { baseSchemaOptions } from "../../shared/mongoose.helpers";

export type ProductVariantAttrs = Omit<ProductVariant, "id" | "productId" | "attributes"> & {
  productId: Types.ObjectId;
  attributes: Map<string, string>;
};
export type ProductVariantDocument = HydratedDocument<ProductVariantAttrs>;

const productVariantSchema = new Schema<ProductVariantAttrs>(
  {
    productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    sku: { type: String, required: true, unique: true, uppercase: true, trim: true },
    attributes: { type: Map, of: String, default: {} },
    defaultGrossWeight: { type: Number, min: 0 },
    defaultNetWeight: { type: Number, min: 0 },
    images: { type: [String], default: [] },
    isActive: { type: Boolean, default: true },
  },
  baseSchemaOptions<ProductVariantAttrs>()
);

productVariantSchema.index({ productId: 1 });

export const ProductVariantModel: Model<ProductVariantAttrs> = model<ProductVariantAttrs>("ProductVariant", productVariantSchema);
