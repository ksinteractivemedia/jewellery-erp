import { Schema, Types, model, type HydratedDocument, type Model } from "mongoose";
import type { InventoryItem } from "@jewellery/types";
import { baseSchemaOptions } from "../../shared/mongoose.helpers";

const ITEM_KINDS = ["FINISHED_JEWELLERY", "RAW_MATERIAL", "SEMI_FINISHED", "LOOSE_STONE"] as const;
const STATUSES = [
  "AVAILABLE",
  "RESERVED",
  "SOLD",
  "RETURNED",
  "DAMAGED",
  "UNDER_REPAIR",
  "IN_MANUFACTURING",
  "WITH_JOB_WORKER",
  "IN_TRANSIT",
  "HALLMARKING",
  "SCRAP",
  "MELTING",
] as const;

export type InventoryItemAttrs = Omit<InventoryItem, "id" | "productId" | "variantId" | "metalId" | "locationId" | "stoneDetails"> & {
  productId?: Types.ObjectId;
  variantId?: Types.ObjectId;
  metalId: Types.ObjectId;
  locationId: Types.ObjectId;
  stoneDetails: (Omit<InventoryItem["stoneDetails"][number], "stoneId"> & { stoneId?: Types.ObjectId })[];
};
export type InventoryItemDocument = HydratedDocument<InventoryItemAttrs>;

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

const inventoryItemSchema = new Schema<InventoryItemAttrs>(
  {
    itemCode: { type: String, required: true, unique: true, uppercase: true, trim: true },
    barcode: { type: String, unique: true, sparse: true },
    serialNumber: { type: String, unique: true, sparse: true },
    productId: { type: Schema.Types.ObjectId, ref: "Product" },
    variantId: { type: Schema.Types.ObjectId, ref: "ProductVariant" },
    type: { type: String, enum: ITEM_KINDS, required: true },
    serialization: { type: String, enum: ["UNIT", "BATCH"], default: "UNIT" },

    grossWeight: { type: Number, required: true, min: 0 },
    stoneWeight: { type: Number, required: true, min: 0, default: 0 },
    netWeight: { type: Number, required: true, min: 0 },
    fineWeight: { type: Number, required: true, min: 0 },

    metalId: { type: Schema.Types.ObjectId, ref: "Metal", required: true },
    purity: { type: String, required: true },
    fineness: { type: Number, required: true, min: 0, max: 1 },

    huid: { type: String, unique: true, sparse: true },
    hallmarkStatus: { type: String, enum: ["NOT_APPLICABLE", "PENDING", "HALLMARKED"], default: "NOT_APPLICABLE" },
    stoneDetails: { type: [stoneDetailSchema], default: [] },

    locationId: { type: Schema.Types.ObjectId, ref: "Location", required: true },
    status: { type: String, enum: STATUSES, default: "AVAILABLE" },

    cost: { type: Number, required: true, min: 0 },
    quantity: { type: Number, required: true, min: 0, default: 1 },

    manufacturingInfo: {
      type: new Schema(
        {
          productionOrderId: { type: Schema.Types.ObjectId, ref: "ProductionOrder" },
          jobWorkOrderId: { type: Schema.Types.ObjectId, ref: "JobWorkOrder" },
          manufacturedDate: Date,
        },
        { _id: false }
      ),
      required: false,
    },
  },
  baseSchemaOptions<InventoryItemAttrs>()
);

inventoryItemSchema.index({ status: 1, locationId: 1 });
inventoryItemSchema.index({ productId: 1 });
inventoryItemSchema.index({ metalId: 1, purity: 1 });

export const InventoryItemModel: Model<InventoryItemAttrs> = model<InventoryItemAttrs>("InventoryItem", inventoryItemSchema);
