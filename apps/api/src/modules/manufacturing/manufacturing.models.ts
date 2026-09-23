import { Schema, Types, model, type HydratedDocument, type Model } from "mongoose";
import { JOB_WORK_ORDER_STATUSES, PRODUCTION_ORDER_STATUSES, type JobWorkOrderStatus, type ProductionOrderStatus } from "@jewellery/types";
import { addressSchema } from "../../shared/address.schema";
import { baseSchemaOptions } from "../../shared/mongoose.helpers";

// ---- shared pieces ---------------------------------------------------------------------------------
const stoneDetailSchema = new Schema(
  { stoneId: { type: Schema.Types.ObjectId, ref: "Stone" }, name: { type: String, required: true }, caratWeight: { type: Number, required: true, min: 0 }, quantity: { type: Number, required: true, min: 1 }, quality: String, certificateNumber: String },
  { _id: false }
);

export interface BomAttrs {
  metalId: Types.ObjectId;
  purity: string;
  fineness: number;
  expectedGrossWeight: number;
  expectedWastage: number;
  stonesRequired: { stoneId?: Types.ObjectId; name: string; caratWeight: number; quantity: number; quality?: string; certificateNumber?: string }[];
  notes?: string;
}
const bomSchema = new Schema<BomAttrs>(
  {
    metalId: { type: Schema.Types.ObjectId, ref: "Metal", required: true },
    purity: { type: String, required: true },
    fineness: { type: Number, required: true },
    expectedGrossWeight: { type: Number, required: true, min: 0 },
    expectedWastage: { type: Number, default: 0, min: 0 },
    stonesRequired: { type: [stoneDetailSchema], default: [] },
    notes: String,
  },
  { _id: false }
);

export interface MaterialItemRefAttrs {
  itemId: Types.ObjectId;
  itemCode: string;
  grossWeight: number;
  /** Issued items only: where it lived before issue — a return goes back there, never into the manufacturing/job-worker location itself. */
  fromLocationId?: Types.ObjectId;
}
const materialItemRefSchema = new Schema<MaterialItemRefAttrs>(
  { itemId: { type: Schema.Types.ObjectId, ref: "InventoryItem", required: true }, itemCode: { type: String, required: true }, grossWeight: { type: Number, required: true, min: 0 }, fromLocationId: { type: Schema.Types.ObjectId, ref: "Location" } },
  { _id: false }
);

export interface ReconciliationAttrs {
  issuedGrossWeight: number;
  returnedGrossWeight: number;
  finishedGrossWeight: number;
  wastageGrossWeight: number;
  discrepancyGrossWeight: number;
  hasDiscrepancy: boolean;
  discrepancyNote?: string;
}
const reconciliationSchema = new Schema<ReconciliationAttrs>(
  {
    issuedGrossWeight: { type: Number, required: true, min: 0 },
    returnedGrossWeight: { type: Number, required: true, min: 0 },
    finishedGrossWeight: { type: Number, required: true, min: 0 },
    wastageGrossWeight: { type: Number, required: true, min: 0 },
    discrepancyGrossWeight: { type: Number, required: true },
    hasDiscrepancy: { type: Boolean, required: true },
    discrepancyNote: String,
  },
  { _id: false }
);

// Not `Omit<ManufacturingHistoryEntry, "at">`: the DTO's `by` is a string id, but the Mongoose field (and every caller) works with a real ObjectId.
export interface HistoryAttrs {
  status: string;
  at: Date;
  by: Types.ObjectId;
  byName?: string;
  note?: string;
}
const historySchema = new Schema<HistoryAttrs>({ status: { type: String, required: true }, at: { type: Date, required: true }, by: { type: Schema.Types.ObjectId, required: true }, byName: String, note: String }, { _id: false });

const qcSchema = new Schema({ status: { type: String, enum: ["PASSED", "FAILED"], required: true }, notes: String, byName: String, at: { type: Date, required: true } }, { _id: false });

// ---- production order -------------------------------------------------------------------------------------
export interface ProductionOrderAttrs {
  createdAt: Date;
  productionOrderNo: string;
  status: ProductionOrderStatus;
  productId: Types.ObjectId;
  variantId?: Types.ObjectId;
  designName: string;
  sku: string;
  quantity: number;
  bom: BomAttrs;
  locationId: Types.ObjectId;
  locationName: string;
  issuedItems: MaterialItemRefAttrs[];
  issuedGrossWeight: number;
  actualGrossWeight?: number;
  actualWastage?: number;
  labourCost?: number;
  qc?: { status: "PASSED" | "FAILED"; notes?: string; byName?: string; at: Date };
  finishedItems: MaterialItemRefAttrs[];
  returnedItems: MaterialItemRefAttrs[];
  reconciliation?: ReconciliationAttrs;
  history: HistoryAttrs[];
}
export type ProductionOrderDocument = HydratedDocument<ProductionOrderAttrs>;
const productionOrderSchema = new Schema<ProductionOrderAttrs>(
  {
    productionOrderNo: { type: String, required: true, unique: true },
    status: { type: String, enum: PRODUCTION_ORDER_STATUSES, required: true, default: "DRAFT" },
    productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    variantId: { type: Schema.Types.ObjectId, ref: "ProductVariant" },
    designName: { type: String, required: true },
    sku: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1 },
    bom: { type: bomSchema, required: true },
    locationId: { type: Schema.Types.ObjectId, ref: "Location", required: true },
    locationName: { type: String, required: true },
    issuedItems: { type: [materialItemRefSchema], default: [] },
    issuedGrossWeight: { type: Number, default: 0, min: 0 },
    actualGrossWeight: { type: Number, min: 0 },
    actualWastage: { type: Number, min: 0 },
    labourCost: { type: Number, min: 0 },
    qc: { type: qcSchema },
    finishedItems: { type: [materialItemRefSchema], default: [] },
    returnedItems: { type: [materialItemRefSchema], default: [] },
    reconciliation: { type: reconciliationSchema },
    history: { type: [historySchema], default: [] },
  },
  baseSchemaOptions<ProductionOrderAttrs>()
);
productionOrderSchema.index({ status: 1, createdAt: -1 });
productionOrderSchema.index({ productId: 1 });
export const ProductionOrderModel: Model<ProductionOrderAttrs> = model<ProductionOrderAttrs>("ProductionOrder", productionOrderSchema);

// ---- job work order -------------------------------------------------------------------------------------
export interface JobWorkOrderAttrs {
  createdAt: Date;
  jobWorkOrderNo: string;
  status: JobWorkOrderStatus;
  vendorId: Types.ObjectId;
  vendorName: string;
  productId?: Types.ObjectId;
  variantId?: Types.ObjectId;
  designName?: string;
  issueDate: string;
  dueDate: string;
  bom: BomAttrs;
  makingCharges: number;
  expectedOutputDescription?: string;
  locationId: Types.ObjectId;
  locationName: string;
  deliveryAddress?: unknown;
  issuedItems: MaterialItemRefAttrs[];
  issuedGrossWeight: number;
  finishedItems: MaterialItemRefAttrs[];
  returnedItems: MaterialItemRefAttrs[];
  reconciliation?: ReconciliationAttrs;
  history: HistoryAttrs[];
}
export type JobWorkOrderDocument = HydratedDocument<JobWorkOrderAttrs>;
const jobWorkOrderSchema = new Schema<JobWorkOrderAttrs>(
  {
    jobWorkOrderNo: { type: String, required: true, unique: true },
    status: { type: String, enum: JOB_WORK_ORDER_STATUSES, required: true, default: "DRAFT" },
    vendorId: { type: Schema.Types.ObjectId, ref: "Supplier", required: true },
    vendorName: { type: String, required: true },
    productId: { type: Schema.Types.ObjectId, ref: "Product" },
    variantId: { type: Schema.Types.ObjectId, ref: "ProductVariant" },
    designName: String,
    issueDate: { type: String, required: true },
    dueDate: { type: String, required: true },
    bom: { type: bomSchema, required: true },
    makingCharges: { type: Number, default: 0, min: 0 },
    expectedOutputDescription: String,
    locationId: { type: Schema.Types.ObjectId, ref: "Location", required: true },
    locationName: { type: String, required: true },
    deliveryAddress: { type: addressSchema },
    issuedItems: { type: [materialItemRefSchema], default: [] },
    issuedGrossWeight: { type: Number, default: 0, min: 0 },
    finishedItems: { type: [materialItemRefSchema], default: [] },
    returnedItems: { type: [materialItemRefSchema], default: [] },
    reconciliation: { type: reconciliationSchema },
    history: { type: [historySchema], default: [] },
  },
  baseSchemaOptions<JobWorkOrderAttrs>()
);
jobWorkOrderSchema.index({ status: 1, createdAt: -1 });
jobWorkOrderSchema.index({ vendorId: 1, createdAt: -1 });
export const JobWorkOrderModel: Model<JobWorkOrderAttrs> = model<JobWorkOrderAttrs>("JobWorkOrder", jobWorkOrderSchema);
