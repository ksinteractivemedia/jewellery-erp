import { Schema, Types, model, type HydratedDocument, type Model } from "mongoose";
import type { ProductCategory } from "@jewellery/types";
import { baseSchemaOptions } from "../../shared/mongoose.helpers";

export type ProductCategoryAttrs = Omit<ProductCategory, "id" | "parentId"> & { parentId?: Types.ObjectId };
export type ProductCategoryDocument = HydratedDocument<ProductCategoryAttrs>;

const productCategorySchema = new Schema<ProductCategoryAttrs>(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    description: String,
    parentId: { type: Schema.Types.ObjectId, ref: "ProductCategory" },
    isActive: { type: Boolean, default: true },
  },
  baseSchemaOptions<ProductCategoryAttrs>()
);

productCategorySchema.index({ parentId: 1 });

export const ProductCategoryModel: Model<ProductCategoryAttrs> = model<ProductCategoryAttrs>("ProductCategory", productCategorySchema);
