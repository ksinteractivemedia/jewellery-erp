import { Schema, Types, model, type Model } from "mongoose";
import type { PriceSnapshot } from "@jewellery/types";
import { appendOnlyPlugin } from "../../shared/append-only.plugin";
import { createdAtOnlySchemaOptions } from "../../shared/mongoose.helpers";

export type PriceSnapshotAttrs = Omit<PriceSnapshot, "id" | "orderId" | "productId" | "variantId" | "computedAt"> & {
  orderId: Types.ObjectId;
  productId: Types.ObjectId;
  variantId?: Types.ObjectId;
  computedAt: Date;
};

/** The frozen price of one design on one order (architecture.md §4). Append-only, like the ledger: it can be read forever and never changed. */
const priceSnapshotSchema = new Schema<PriceSnapshotAttrs>(
  {
    orderId: { type: Schema.Types.ObjectId, ref: "Order", required: true, index: true },
    productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    variantId: { type: Schema.Types.ObjectId, ref: "ProductVariant" },
    documentType: { type: String, enum: ["ORDER", "B2B_QUOTATION", "B2B_SALES_ORDER"], default: "ORDER" },
    sku: { type: String, required: true },
    computedAt: { type: Date, required: true },
    inputs: { type: Schema.Types.Mixed, required: true },
    breakdown: { type: Schema.Types.Mixed, required: true },
    unitTotal: { type: Number, required: true, min: 0 },
  },
  createdAtOnlySchemaOptions<PriceSnapshotAttrs>({ minimize: false })
);
priceSnapshotSchema.plugin(appendOnlyPlugin, { entityName: "PriceSnapshot" });

export const PriceSnapshotModel: Model<PriceSnapshotAttrs> = model<PriceSnapshotAttrs>("PriceSnapshot", priceSnapshotSchema);
