import { Schema, Types, model, type HydratedDocument, type Model } from "mongoose";
import {
  PURCHASE_REQUISITION_STATUSES,
  SUPPLIER_PURCHASE_ORDER_STATUSES,
  PURCHASE_TYPES,
  SUPPLIER_PAYMENT_METHODS,
  SUPPLIER_PAYMENT_STATUSES,
  type PurchaseRequisitionStatus,
  type SupplierPurchaseOrderStatus,
  type PurchaseType,
  type SupplierPaymentMethod,
  type SupplierPaymentStatus,
} from "@jewellery/types";
import { addressSchema } from "../../shared/address.schema";
import { freezePaths } from "../../shared/immutable-paths";
import { baseSchemaOptions } from "../../shared/mongoose.helpers";

// ---- shared pieces ---------------------------------------------------------------------------------
export interface PurchaseLineAttrs {
  purchaseType: PurchaseType;
  description: string;
  productId?: Types.ObjectId;
  variantId?: Types.ObjectId;
  metalId?: Types.ObjectId;
  purity?: string;
  fineness?: number;
  quantity: number;
  grossWeight?: number;
  ratePerGram?: number;
  ratePerUnit?: number;
  value: number;
  lotNumber?: string;
  notes?: string;
  receivedQuantity: number;
  receivedGrossWeight: number;
}
export type SupplierInvoiceLineAttrs = Omit<PurchaseLineAttrs, "receivedQuantity" | "receivedGrossWeight">;
export interface TotalsAttrs {
  subtotal: number;
  taxAmount: number;
  total: number;
}
// Not `Omit<PurchaseHistoryEntry, "at">`: the DTO's `by` is a string id, but the Mongoose field (and every caller) works with a real ObjectId.
export interface HistoryAttrs {
  status: string;
  at: Date;
  by: Types.ObjectId;
  byName?: string;
  note?: string;
}

const money = { type: Number, required: true, min: 0 };
const purchaseLineFields = {
  purchaseType: { type: String, enum: PURCHASE_TYPES, required: true },
  description: { type: String, required: true },
  productId: { type: Schema.Types.ObjectId, ref: "Product" },
  variantId: { type: Schema.Types.ObjectId, ref: "ProductVariant" },
  metalId: { type: Schema.Types.ObjectId, ref: "Metal" },
  purity: String,
  fineness: Number,
  quantity: { type: Number, required: true, min: 1 },
  grossWeight: { type: Number, min: 0 },
  ratePerGram: { type: Number, min: 0 },
  ratePerUnit: { type: Number, min: 0 },
  value: { ...money, min: 0 },
  lotNumber: String,
  notes: String,
};
const purchaseLineSchema = new Schema<PurchaseLineAttrs>({ ...purchaseLineFields, receivedQuantity: { type: Number, default: 0, min: 0 }, receivedGrossWeight: { type: Number, default: 0, min: 0 } }, { _id: false });
const supplierInvoiceLineSchema = new Schema<SupplierInvoiceLineAttrs>(purchaseLineFields, { _id: false });
const totalsSchema = new Schema<TotalsAttrs>({ subtotal: money, taxAmount: { ...money, default: 0 }, total: money }, { _id: false });
const historySchema = new Schema<HistoryAttrs>({ status: { type: String, required: true }, at: { type: Date, required: true }, by: { type: Schema.Types.ObjectId, required: true }, byName: String, note: String }, { _id: false });

// ---- purchase requisition -----------------------------------------------------------------------------
export interface PurchaseRequisitionAttrs {
  createdAt: Date;
  prNo: string;
  status: PurchaseRequisitionStatus;
  requestedById: Types.ObjectId;
  requestedByName: string;
  department?: string;
  reason: string;
  lines: PurchaseLineAttrs[];
  totals: TotalsAttrs;
  purchaseOrderId?: Types.ObjectId;
  rejectedReason?: string;
  history: HistoryAttrs[];
}
export type PurchaseRequisitionDocument = HydratedDocument<PurchaseRequisitionAttrs>;
const requisitionSchema = new Schema<PurchaseRequisitionAttrs>(
  {
    prNo: { type: String, required: true, unique: true },
    status: { type: String, enum: PURCHASE_REQUISITION_STATUSES, required: true, default: "DRAFT" },
    requestedById: { type: Schema.Types.ObjectId, ref: "User", required: true },
    requestedByName: { type: String, required: true },
    department: String,
    reason: { type: String, required: true },
    lines: { type: [purchaseLineSchema], required: true },
    totals: { type: totalsSchema, required: true },
    purchaseOrderId: { type: Schema.Types.ObjectId, ref: "PurchaseOrder" },
    rejectedReason: String,
    history: { type: [historySchema], default: [] },
  },
  baseSchemaOptions<PurchaseRequisitionAttrs>()
);
requisitionSchema.index({ status: 1, createdAt: -1 });
export const PurchaseRequisitionModel: Model<PurchaseRequisitionAttrs> = model<PurchaseRequisitionAttrs>("PurchaseRequisition", requisitionSchema);

// ---- purchase order -------------------------------------------------------------------------------------
export interface PurchaseOrderAttrs {
  createdAt: Date;
  poNo: string;
  status: SupplierPurchaseOrderStatus;
  supplierId: Types.ObjectId;
  supplierName: string;
  supplierGstin?: string;
  requisitionId?: Types.ObjectId;
  lines: PurchaseLineAttrs[];
  totals: TotalsAttrs;
  deliveryLocationId: Types.ObjectId;
  deliveryLocationName: string;
  billingAddress?: unknown;
  expectedDeliveryDate?: string;
  notes?: string;
  approvedAt?: Date;
  approvedByName?: string;
  rejectedReason?: string;
  cancelledReason?: string;
  goodsReceiptIds: Types.ObjectId[];
  supplierInvoiceIds: Types.ObjectId[];
  history: HistoryAttrs[];
}
export type PurchaseOrderDocument = HydratedDocument<PurchaseOrderAttrs>;
const purchaseOrderSchema = new Schema<PurchaseOrderAttrs>(
  {
    poNo: { type: String, required: true, unique: true },
    status: { type: String, enum: SUPPLIER_PURCHASE_ORDER_STATUSES, required: true, default: "DRAFT" },
    supplierId: { type: Schema.Types.ObjectId, ref: "Supplier", required: true },
    supplierName: { type: String, required: true },
    supplierGstin: String,
    requisitionId: { type: Schema.Types.ObjectId, ref: "PurchaseRequisition" },
    lines: { type: [purchaseLineSchema], required: true },
    totals: { type: totalsSchema, required: true },
    deliveryLocationId: { type: Schema.Types.ObjectId, ref: "Location", required: true },
    deliveryLocationName: { type: String, required: true },
    billingAddress: { type: addressSchema },
    expectedDeliveryDate: String,
    notes: String,
    approvedAt: Date,
    approvedByName: String,
    rejectedReason: String,
    cancelledReason: String,
    goodsReceiptIds: { type: [{ type: Schema.Types.ObjectId, ref: "GoodsReceipt" }], default: [] },
    supplierInvoiceIds: { type: [{ type: Schema.Types.ObjectId, ref: "SupplierInvoice" }], default: [] },
    history: { type: [historySchema], default: [] },
  },
  baseSchemaOptions<PurchaseOrderAttrs>()
);
purchaseOrderSchema.index({ status: 1, createdAt: -1 });
purchaseOrderSchema.index({ supplierId: 1, createdAt: -1 });
export const PurchaseOrderModel: Model<PurchaseOrderAttrs> = model<PurchaseOrderAttrs>("PurchaseOrder", purchaseOrderSchema);

// ---- goods receipt --------------------------------------------------------------------------------------
export interface GoodsReceiptLineAttrs {
  purchaseOrderLineIndex: number;
  purchaseType: PurchaseType;
  description: string;
  metalId?: Types.ObjectId;
  purity?: string;
  fineness?: number;
  quantity: number;
  grossWeight?: number;
  expectedGrossWeight?: number;
  fineWeight?: number;
  ratePerGram?: number;
  ratePerUnit?: number;
  value: number;
  lotNumber?: string;
  locationId: Types.ObjectId;
  hasWeightDiscrepancy: boolean;
  variancePercent?: number;
  discrepancyNote?: string;
  inventoryItemIds: Types.ObjectId[];
}
export interface GoodsReceiptAttrs {
  createdAt: Date;
  grnNo: string;
  purchaseOrderId: Types.ObjectId;
  poNo: string;
  supplierId: Types.ObjectId;
  supplierName: string;
  receivedDate: string;
  lines: GoodsReceiptLineAttrs[];
  notes?: string;
  receivedById: Types.ObjectId;
  receivedByName?: string;
}
export type GoodsReceiptDocument = HydratedDocument<GoodsReceiptAttrs>;
const goodsReceiptLineSchema = new Schema<GoodsReceiptLineAttrs>(
  {
    purchaseOrderLineIndex: { type: Number, required: true, min: 0 },
    purchaseType: { type: String, enum: PURCHASE_TYPES, required: true },
    description: { type: String, required: true },
    metalId: { type: Schema.Types.ObjectId, ref: "Metal" },
    purity: String,
    fineness: Number,
    quantity: { type: Number, required: true, min: 0 },
    grossWeight: { type: Number, min: 0 },
    expectedGrossWeight: { type: Number, min: 0 },
    fineWeight: { type: Number, min: 0 },
    ratePerGram: { type: Number, min: 0 },
    ratePerUnit: { type: Number, min: 0 },
    value: { ...money, min: 0 },
    lotNumber: String,
    locationId: { type: Schema.Types.ObjectId, ref: "Location", required: true },
    hasWeightDiscrepancy: { type: Boolean, default: false },
    variancePercent: Number,
    discrepancyNote: String,
    inventoryItemIds: { type: [{ type: Schema.Types.ObjectId, ref: "InventoryItem" }], default: [] },
  },
  { _id: false }
);
const goodsReceiptSchema = new Schema<GoodsReceiptAttrs>(
  {
    grnNo: { type: String, required: true, unique: true },
    purchaseOrderId: { type: Schema.Types.ObjectId, ref: "PurchaseOrder", required: true },
    poNo: { type: String, required: true },
    supplierId: { type: Schema.Types.ObjectId, ref: "Supplier", required: true },
    supplierName: { type: String, required: true },
    receivedDate: { type: String, required: true },
    lines: { type: [goodsReceiptLineSchema], required: true },
    notes: String,
    receivedById: { type: Schema.Types.ObjectId, ref: "User", required: true },
    receivedByName: String,
  },
  baseSchemaOptions<GoodsReceiptAttrs>()
);
goodsReceiptSchema.index({ purchaseOrderId: 1, createdAt: -1 });
// A goods receipt is a historical fact about what physically arrived — never edited or deleted, whatever it turns out to say.
freezePaths(goodsReceiptSchema, ["grnNo", "purchaseOrderId", "poNo", "supplierId", "supplierName", "receivedDate", "lines", "receivedById", "receivedByName"], "Goods receipt");
export const GoodsReceiptModel: Model<GoodsReceiptAttrs> = model<GoodsReceiptAttrs>("GoodsReceipt", goodsReceiptSchema);

// ---- supplier invoice -------------------------------------------------------------------------------------
export interface SupplierInvoiceAttrs {
  createdAt: Date;
  supplierInvoiceNo: string;
  supplierId: Types.ObjectId;
  supplierName: string;
  supplierGstin?: string;
  purchaseOrderId?: Types.ObjectId;
  poNo?: string;
  goodsReceiptIds: Types.ObjectId[];
  invoiceDate: string;
  dueDate: string;
  lines: SupplierInvoiceLineAttrs[];
  totals: TotalsAttrs;
  cancelledAt?: Date;
  cancelledReason?: string;
  history: HistoryAttrs[];
  /** Bumped by every allocation against this invoice — not read for its value, but touching the document is what makes two allocations racing for the same invoice conflict in MongoDB rather than both reading a stale balance (mirrors B2B's Invoice.allocationSeq). */
  allocationSeq: number;
}
export type SupplierInvoiceDocument = HydratedDocument<SupplierInvoiceAttrs>;
const supplierInvoiceSchema = new Schema<SupplierInvoiceAttrs>(
  {
    supplierInvoiceNo: { type: String, required: true },
    supplierId: { type: Schema.Types.ObjectId, ref: "Supplier", required: true },
    supplierName: { type: String, required: true },
    supplierGstin: String,
    purchaseOrderId: { type: Schema.Types.ObjectId, ref: "PurchaseOrder" },
    poNo: String,
    goodsReceiptIds: { type: [{ type: Schema.Types.ObjectId, ref: "GoodsReceipt" }], default: [] },
    invoiceDate: { type: String, required: true },
    dueDate: { type: String, required: true },
    lines: { type: [supplierInvoiceLineSchema], required: true },
    totals: { type: totalsSchema, required: true },
    cancelledAt: Date,
    cancelledReason: String,
    history: { type: [historySchema], default: [] },
    allocationSeq: { type: Number, default: 0 },
  },
  baseSchemaOptions<SupplierInvoiceAttrs>()
);
// One invoice number per supplier — the same paper bill can't be entered against them twice.
supplierInvoiceSchema.index({ supplierId: 1, supplierInvoiceNo: 1 }, { unique: true });
supplierInvoiceSchema.index({ purchaseOrderId: 1 });
freezePaths(supplierInvoiceSchema, ["supplierInvoiceNo", "supplierId", "supplierName", "supplierGstin", "purchaseOrderId", "poNo", "goodsReceiptIds", "invoiceDate", "dueDate", "lines", "totals"], "Supplier invoice");
export const SupplierInvoiceModel: Model<SupplierInvoiceAttrs> = model<SupplierInvoiceAttrs>("SupplierInvoice", supplierInvoiceSchema);

// ---- supplier payment --------------------------------------------------------------------------------------
export interface SupplierPaymentAttrs {
  createdAt: Date;
  paymentNo: string;
  status: SupplierPaymentStatus;
  supplierId: Types.ObjectId;
  supplierName: string;
  method: SupplierPaymentMethod;
  amount: number;
  paidDate: string;
  reference?: string;
  bankName?: string;
  notes?: string;
  recordedById: Types.ObjectId;
  recordedByName?: string;
  reversedReason?: string;
  reversedAt?: Date;
  allocationSeq: number;
}
export type SupplierPaymentDocument = HydratedDocument<SupplierPaymentAttrs>;
const supplierPaymentSchema = new Schema<SupplierPaymentAttrs>(
  {
    paymentNo: { type: String, required: true, unique: true },
    status: { type: String, enum: SUPPLIER_PAYMENT_STATUSES, required: true, default: "RECORDED" },
    supplierId: { type: Schema.Types.ObjectId, ref: "Supplier", required: true },
    supplierName: { type: String, required: true },
    method: { type: String, enum: SUPPLIER_PAYMENT_METHODS, required: true },
    amount: { ...money, min: 1 },
    paidDate: { type: String, required: true },
    reference: String,
    bankName: String,
    notes: String,
    recordedById: { type: Schema.Types.ObjectId, ref: "User", required: true },
    recordedByName: String,
    reversedReason: String,
    reversedAt: Date,
    allocationSeq: { type: Number, default: 0 },
  },
  baseSchemaOptions<SupplierPaymentAttrs>()
);
supplierPaymentSchema.index({ supplierId: 1, createdAt: -1 });
freezePaths(supplierPaymentSchema, ["paymentNo", "supplierId", "supplierName", "method", "amount", "paidDate", "reference", "bankName", "recordedById", "recordedByName"], "Supplier payment");
export const SupplierPaymentModel: Model<SupplierPaymentAttrs> = model<SupplierPaymentAttrs>("SupplierPayment", supplierPaymentSchema);

export interface SupplierPaymentAllocationAttrs {
  createdAt: Date;
  paymentId: Types.ObjectId;
  paymentNo: string;
  supplierInvoiceId: Types.ObjectId;
  supplierInvoiceNo: string;
  supplierId: Types.ObjectId;
  amount: number;
  createdById: Types.ObjectId;
  createdByName?: string;
  reversedAt?: Date;
  reversedReason?: string;
}
export type SupplierPaymentAllocationDocument = HydratedDocument<SupplierPaymentAllocationAttrs>;
const supplierPaymentAllocationSchema = new Schema<SupplierPaymentAllocationAttrs>(
  {
    paymentId: { type: Schema.Types.ObjectId, ref: "SupplierPayment", required: true },
    paymentNo: { type: String, required: true },
    supplierInvoiceId: { type: Schema.Types.ObjectId, ref: "SupplierInvoice", required: true },
    supplierInvoiceNo: { type: String, required: true },
    supplierId: { type: Schema.Types.ObjectId, ref: "Supplier", required: true },
    amount: { ...money, min: 1 },
    createdById: { type: Schema.Types.ObjectId, ref: "User", required: true },
    createdByName: String,
    reversedAt: Date,
    reversedReason: String,
  },
  baseSchemaOptions<SupplierPaymentAllocationAttrs>()
);
supplierPaymentAllocationSchema.index({ supplierInvoiceId: 1 });
supplierPaymentAllocationSchema.index({ paymentId: 1 });
freezePaths(supplierPaymentAllocationSchema, ["paymentId", "paymentNo", "supplierInvoiceId", "supplierInvoiceNo", "supplierId", "amount", "createdById", "createdByName"], "Supplier payment allocation");
export const SupplierPaymentAllocationModel: Model<SupplierPaymentAllocationAttrs> = model<SupplierPaymentAllocationAttrs>("SupplierPaymentAllocation", supplierPaymentAllocationSchema);
