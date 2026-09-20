import { Schema, Types, model, type HydratedDocument, type Model } from "mongoose";
import type { Product } from "@jewellery/types";
import { baseSchemaOptions } from "../../shared/mongoose.helpers";

export type ProductAttrs = Omit<Product, "id" | "categoryId" | "collectionIds" | "metalId" | "stoneDetails" | "createdBy" | "updatedBy"> & {
  categoryId?: Types.ObjectId;
  collectionIds: Types.ObjectId[];
  metalId: Types.ObjectId;
  stoneDetails: (Omit<Product["stoneDetails"][number], "stoneId"> & { stoneId?: Types.ObjectId })[];
  createdBy?: Types.ObjectId;
  updatedBy?: Types.ObjectId;
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

const imageSchema = new Schema({ key: { type: String, required: true }, alt: String }, { _id: false });

/**
 * A Product is the catalogue definition. It deliberately has no quantity/status-of-a-piece —
 * physical stock is InventoryItem, and every stock change is an InventoryLedger entry.
 */
const productSchema = new Schema<ProductAttrs>(
  {
    sku: { type: String, required: true, unique: true, uppercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    description: String,
    categoryId: { type: Schema.Types.ObjectId, ref: "ProductCategory" },
    collectionIds: { type: [{ type: Schema.Types.ObjectId, ref: "ProductCollection" }], default: [] },
    metalId: { type: Schema.Types.ObjectId, ref: "Metal", required: true },
    purity: { type: String, trim: true },
    defaultGrossWeight: { type: Number, min: 0 },
    defaultNetWeight: { type: Number, min: 0 },
    stoneDetails: { type: [stoneDetailSchema], default: [] },
    images: { type: [imageSchema], default: [] },
    videos: { type: [String], default: [] },
    tags: { type: [String], default: [] },
    b2cEnabled: { type: Boolean, default: false },
    b2bEnabled: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  baseSchemaOptions<ProductAttrs>()
);

productSchema.index({ categoryId: 1, isActive: 1 });
productSchema.index({ collectionIds: 1 });
productSchema.index({ metalId: 1 });
productSchema.index({ tags: 1 });
productSchema.index({ updatedAt: -1 });

export const ProductModel: Model<ProductAttrs> = model<ProductAttrs>("Product", productSchema);
