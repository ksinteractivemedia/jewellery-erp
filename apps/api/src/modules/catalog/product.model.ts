import { Schema, Types, model, type HydratedDocument, type Model } from "mongoose";
import type { Product } from "@jewellery/types";
import { baseSchemaOptions } from "../../shared/mongoose.helpers";

export type ProductAttrs = Omit<Product, "id" | "categoryId" | "metalId" | "stoneDetails"> & {
  categoryId?: Types.ObjectId;
  metalId: Types.ObjectId;
  stoneDetails: (Omit<Product["stoneDetails"][number], "stoneId"> & { stoneId?: Types.ObjectId })[];
};
export type ProductDocument = HydratedDocument<ProductAttrs>;

const stoneDetailSchema = new Schema(
  {
    stoneId: { type: Schema.Types.ObjectId, ref: "Stone" },
    name: { type: String, required: true },
    caratWeight: { type: Number, required: true, min: 0 },
    quantity: { type: Number, required: true, min: 1 },
    quality: String,
    certificateNumber: String,
  },
  { _id: false }
);

const productSchema = new Schema<ProductAttrs>(
  {
    sku: { type: String, required: true, unique: true, uppercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    description: String,
    images: { type: [String], default: [] },
    categoryId: { type: Schema.Types.ObjectId, ref: "ProductCategory" },
    metalId: { type: Schema.Types.ObjectId, ref: "Metal", required: true },
    defaultPurity: String,
    defaultGrossWeight: { type: Number, min: 0 },
    defaultNetWeight: { type: Number, min: 0 },
    stoneDetails: { type: [stoneDetailSchema], default: [] },
    status: { type: String, enum: ["DRAFT", "ACTIVE", "DISCONTINUED"], default: "DRAFT" },
    channelVisibility: { type: String, enum: ["ERP", "B2C", "B2B", "BOTH"], default: "BOTH" },
    hasVariants: { type: Boolean, default: false },
  },
  baseSchemaOptions<ProductAttrs>()
);

productSchema.index({ categoryId: 1, status: 1 });
productSchema.index({ metalId: 1 });

export const ProductModel: Model<ProductAttrs> = model<ProductAttrs>("Product", productSchema);
