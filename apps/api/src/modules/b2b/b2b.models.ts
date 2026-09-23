import { Schema, Types, model, type HydratedDocument, type Model } from "mongoose";
import { B2B_PAYMENT_METHODS, B2B_PAYMENT_STATUSES, PURCHASE_ORDER_STATUSES, QUOTATION_STATUSES, SALES_ORDER_STATUSES } from "@jewellery/types";
import type { B2BHistoryEntry, B2BPaymentMethod, B2BPaymentStatus, B2BQuotationMessage, PurchaseOrderStatus, QuotationStatus, SalesOrderStatus } from "@jewellery/types";
import { addressSchema } from "../../shared/address.schema";
import { freezePaths } from "../../shared/immutable-paths";
import { baseSchemaOptions } from "../../shared/mongoose.helpers";

// ---- shared pieces ---------------------------------------------------------------------------------
export interface LineAttrs {
  productId: Types.ObjectId;
  variantId?: Types.ObjectId;
  sku: string;
  name: string;
  variantLabel?: string;
  quantity: number;
  priceOnRequest?: boolean;
  unitMaking: number;
  unitDiscount: number;
  unitTaxable: number;
  unitGst: number;
  unitTotal: number;
  lineMaking: number;
  lineDiscount: number;
  lineTaxable: number;
  lineGst: number;
  lineTotal: number;
  basis?: string;
  concession?: { kind: "PERCENT" | "TARGET_PRICE"; value: number; note?: string; listUnitTaxable?: number };
  priceSnapshotId?: Types.ObjectId;
}
export interface TotalsAttrs { taxable: number; gst: number; total: number; complete: boolean }
export interface HistoryAttrs extends Omit<B2BHistoryEntry, "at"> { at: Date }
export type AddressAttrs = { line1: string; line2?: string; city: string; state: string; postalCode: string; country: string };

const money = { type: Number, required: true, min: 0 };
const lineSchema = new Schema<LineAttrs>(
  {
    productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    variantId: { type: Schema.Types.ObjectId, ref: "ProductVariant" },
    sku: { type: String, required: true },
    name: { type: String, required: true },
    variantLabel: String,
    quantity: { type: Number, required: true, min: 1 },
    priceOnRequest: Boolean,
    unitMaking: { type: Number, default: 0, min: 0 },
    unitDiscount: { type: Number, default: 0, min: 0 },
    unitTaxable: money,
    unitGst: money,
    unitTotal: money,
    lineMaking: { type: Number, default: 0, min: 0 },
    lineDiscount: { type: Number, default: 0, min: 0 },
    lineTaxable: money,
    lineGst: money,
    lineTotal: money,
    basis: String,
    concession: { type: new Schema({ kind: { type: String, enum: ["PERCENT", "TARGET_PRICE"] }, value: Number, note: String, listUnitTaxable: Number }, { _id: false }) },
    priceSnapshotId: { type: Schema.Types.ObjectId, ref: "PriceSnapshot" },
  },
  { _id: false }
);
const totalsSchema = new Schema<TotalsAttrs>({ taxable: money, gst: money, total: money, complete: { type: Boolean, default: true } }, { _id: false });
const historySchema = new Schema({ status: { type: String, required: true }, at: { type: Date, required: true }, by: { type: String, enum: ["CUSTOMER", "SELLER", "SYSTEM"], required: true }, actorName: String, note: String }, { _id: false });

// ---- purchase order --------------------------------------------------------------------------------
export interface PurchaseOrderAttrs {
  poNo: string;
  customerId: Types.ObjectId;
  customerName: string;
  customerPoRef?: string;
  status: PurchaseOrderStatus;
  lines: LineAttrs[];
  totals: TotalsAttrs;
  shippingAddress: AddressAttrs;
  billingAddress: AddressAttrs;
  notes?: string;
  requestedDeliveryDate?: string;
  /** Private files the customer (or seller) attached; the bytes live in document storage under `key`, never at a public URL. */
  attachments: { _id: Types.ObjectId; name: string; mimeType: string; size: number; key: string; uploadedAt: Date; uploadedBy: "CUSTOMER" | "SELLER"; uploadedById: Types.ObjectId; uploadedByName?: string }[];
  /** What was agreed: set when the PO is approved (by the seller directly, or by the customer accepting a quotation). */
  approved?: { lines: LineAttrs[]; totals: TotalsAttrs; approvedAt: Date; approvedByName?: string; via: "QUOTATION" | "DIRECT" };
  credit?: unknown;
  quotationId?: Types.ObjectId;
  salesOrderId?: Types.ObjectId;
  reviewerId?: Types.ObjectId;
  submittedAt?: Date;
  history: HistoryAttrs[];
  createdAt: Date;
  updatedAt: Date;
}
export type PurchaseOrderDocument = HydratedDocument<PurchaseOrderAttrs>;
const poSchema = new Schema<PurchaseOrderAttrs>(
  {
    poNo: { type: String, required: true, unique: true },
    customerId: { type: Schema.Types.ObjectId, ref: "Customer", required: true, index: true },
    customerName: { type: String, required: true },
    customerPoRef: String,
    status: { type: String, enum: PURCHASE_ORDER_STATUSES, required: true, index: true },
    lines: { type: [lineSchema], validate: (v: unknown[]) => v.length > 0 },
    totals: { type: totalsSchema, required: true },
    shippingAddress: { type: addressSchema, required: true },
    billingAddress: { type: addressSchema, required: true },
    notes: String,
    requestedDeliveryDate: String,
    attachments: { type: [new Schema({ name: { type: String, required: true }, mimeType: { type: String, required: true }, size: { type: Number, required: true }, key: { type: String, required: true }, uploadedAt: { type: Date, required: true }, uploadedBy: { type: String, enum: ["CUSTOMER", "SELLER"], required: true }, uploadedById: { type: Schema.Types.ObjectId, required: true }, uploadedByName: String })], default: [] },
    approved: { type: new Schema({ lines: { type: [lineSchema], default: [] }, totals: { type: totalsSchema }, approvedAt: Date, approvedByName: String, via: { type: String, enum: ["QUOTATION", "DIRECT"] } }, { _id: false }) },
    credit: Schema.Types.Mixed,
    quotationId: { type: Schema.Types.ObjectId, ref: "Quotation" },
    salesOrderId: { type: Schema.Types.ObjectId, ref: "B2BSalesOrder" },
    reviewerId: { type: Schema.Types.ObjectId, ref: "User" },
    submittedAt: Date,
    history: { type: [historySchema], default: [] },
  },
  baseSchemaOptions<PurchaseOrderAttrs>()
);
poSchema.index({ customerId: 1, createdAt: -1 });
export const PurchaseOrderModel: Model<PurchaseOrderAttrs> = model<PurchaseOrderAttrs>("B2BPurchaseOrder", poSchema);

// ---- quotation -------------------------------------------------------------------------------------
export interface QuotationAttrs {
  quoteNo: string;
  purchaseOrderId: Types.ObjectId;
  customerId: Types.ObjectId;
  version: number;
  status: QuotationStatus;
  lines: LineAttrs[];
  totals: TotalsAttrs;
  validUntil: Date;
  terms?: string;
  messages: (Omit<B2BQuotationMessage, "at"> & { at: Date })[];
  issuedAt: Date;
  issuedBy?: Types.ObjectId;
  createdAt: Date;
}
export type QuotationDocument = HydratedDocument<QuotationAttrs>;
const quotationSchema = new Schema<QuotationAttrs>(
  {
    quoteNo: { type: String, required: true, unique: true },
    purchaseOrderId: { type: Schema.Types.ObjectId, ref: "B2BPurchaseOrder", required: true, index: true },
    customerId: { type: Schema.Types.ObjectId, ref: "Customer", required: true, index: true },
    version: { type: Number, required: true, min: 1 },
    status: { type: String, enum: QUOTATION_STATUSES, required: true },
    lines: { type: [lineSchema], validate: (v: unknown[]) => v.length > 0 },
    totals: { type: totalsSchema, required: true },
    validUntil: { type: Date, required: true },
    terms: String,
    messages: { type: [new Schema({ by: { type: String, enum: ["CUSTOMER", "SELLER"], required: true }, at: { type: Date, required: true }, text: { type: String, required: true }, requestedPrices: [new Schema({ sku: String, unitTaxable: Number }, { _id: false })] }, { _id: false })], default: [] },
    issuedAt: { type: Date, required: true },
    issuedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  baseSchemaOptions<QuotationAttrs>()
);
quotationSchema.index({ purchaseOrderId: 1, version: 1 }, { unique: true });
freezePaths(quotationSchema, ["quoteNo", "purchaseOrderId", "customerId", "version", "lines", "totals", "validUntil", "issuedAt"], "Quotation");
export const QuotationModel: Model<QuotationAttrs> = model<QuotationAttrs>("B2BQuotation", quotationSchema);

// ---- sales order -----------------------------------------------------------------------------------
export interface SalesOrderAttrs {
  soNo: string;
  purchaseOrderId: Types.ObjectId;
  poNo: string;
  customerPoRef?: string;
  quotationId?: Types.ObjectId;
  customerId: Types.ObjectId;
  customerName: string;
  status: SalesOrderStatus;
  lines: LineAttrs[];
  totals: TotalsAttrs;
  shippingAddress: AddressAttrs;
  billingAddress: AddressAttrs;
  /** The credit check as it stood when the order was created, and any override that let it through. */
  credit: { check: unknown; override?: { reason: string; at: Date; byId: Types.ObjectId; byName?: string } };
  shortfall?: unknown;
  /** Pieces held for each line (by line index). Fulfilment state, not commercial state. */
  allocations: { lineIndex: number; itemIds: Types.ObjectId[] }[];
  /** Pieces sold and invoiced so far, per line. */
  invoiced: { lineIndex: number; quantity: number }[];
  allocatedAt?: Date;
  invoiceIds: Types.ObjectId[];
  history: HistoryAttrs[];
  createdAt: Date;
}
export type SalesOrderDocument = HydratedDocument<SalesOrderAttrs>;
const salesOrderSchema = new Schema<SalesOrderAttrs>(
  {
    soNo: { type: String, required: true, unique: true },
    purchaseOrderId: { type: Schema.Types.ObjectId, ref: "B2BPurchaseOrder", required: true, unique: true },
    poNo: { type: String, required: true },
    customerPoRef: String,
    quotationId: { type: Schema.Types.ObjectId, ref: "B2BQuotation" },
    customerId: { type: Schema.Types.ObjectId, ref: "Customer", required: true, index: true },
    customerName: { type: String, required: true },
    status: { type: String, enum: SALES_ORDER_STATUSES, required: true, index: true },
    lines: { type: [lineSchema], validate: (v: unknown[]) => v.length > 0 },
    totals: { type: totalsSchema, required: true },
    shippingAddress: { type: addressSchema, required: true },
    billingAddress: { type: addressSchema, required: true },
    credit: { type: Schema.Types.Mixed, required: true },
    shortfall: Schema.Types.Mixed,
    allocations: { type: [new Schema({ lineIndex: Number, itemIds: [{ type: Schema.Types.ObjectId, ref: "InventoryItem" }] }, { _id: false })], default: [] },
    invoiced: { type: [new Schema({ lineIndex: Number, quantity: Number }, { _id: false })], default: [] },
    allocatedAt: Date,
    invoiceIds: { type: [{ type: Schema.Types.ObjectId, ref: "B2BInvoice" }], default: [] },
    history: { type: [historySchema], default: [] },
  },
  baseSchemaOptions<SalesOrderAttrs>()
);
freezePaths(salesOrderSchema, ["soNo", "purchaseOrderId", "poNo", "quotationId", "customerId", "lines", "totals", "shippingAddress", "billingAddress"], "Sales order");
export const SalesOrderModel: Model<SalesOrderAttrs> = model<SalesOrderAttrs>("B2BSalesOrder", salesOrderSchema);

// ---- invoice ---------------------------------------------------------------------------------------
export interface InvoiceAttrs {
  invoiceNo: string;
  salesOrderId: Types.ObjectId;
  soNo: string;
  customerId: Types.ObjectId;
  customerName: string;
  gstin?: string;
  /** Business days (IST), YYYY-MM-DD. Overdue is decided from the due date at read time, never stored. */
  issueDate: string;
  dueDate: string;
  lines: LineAttrs[];
  totals: TotalsAttrs;
  taxes: { supplyType: "INTRA_STATE" | "INTER_STATE"; cgst: number; sgst: number; igst: number };
  shippingAddress: AddressAttrs;
  billingAddress: AddressAttrs;
  /** 1, 2, 3 … — an order may be invoiced in several parts. */
  sequence: number;
  status: "ISSUED" | "CANCELLED";
  /** Bumped by every allocation so two allocations racing on one invoice conflict instead of over-paying it. */
  allocationSeq: number;
  createdBy?: Types.ObjectId;
  createdAt: Date;
}
export type InvoiceDocument = HydratedDocument<InvoiceAttrs>;
const invoiceSchema = new Schema<InvoiceAttrs>(
  {
    invoiceNo: { type: String, required: true, unique: true },
    salesOrderId: { type: Schema.Types.ObjectId, ref: "B2BSalesOrder", required: true, index: true },
    soNo: { type: String, required: true },
    customerId: { type: Schema.Types.ObjectId, ref: "Customer", required: true, index: true },
    customerName: { type: String, required: true },
    gstin: String,
    issueDate: { type: String, required: true },
    dueDate: { type: String, required: true },
    lines: { type: [lineSchema], validate: (v: unknown[]) => v.length > 0 },
    totals: { type: totalsSchema, required: true },
    taxes: { type: Schema.Types.Mixed, required: true },
    shippingAddress: { type: addressSchema, required: true },
    billingAddress: { type: addressSchema, required: true },
    sequence: { type: Number, default: 1, min: 1 },
    status: { type: String, enum: ["ISSUED", "CANCELLED"], default: "ISSUED" },
    allocationSeq: { type: Number, default: 0 },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  baseSchemaOptions<InvoiceAttrs>()
);
invoiceSchema.index({ customerId: 1, dueDate: 1 });
freezePaths(invoiceSchema, ["invoiceNo", "salesOrderId", "soNo", "customerId", "customerName", "gstin", "issueDate", "dueDate", "lines", "totals", "taxes", "shippingAddress", "billingAddress", "sequence"], "Invoice");
export const InvoiceModel: Model<InvoiceAttrs> = model<InvoiceAttrs>("B2BInvoice", invoiceSchema);

// ---- payment & allocation --------------------------------------------------------------------------
export interface B2BPaymentAttrs {
  paymentNo: string;
  customerId: Types.ObjectId;
  method: B2BPaymentMethod;
  amount: number;
  receivedDate: string;
  reference?: string;
  bankName?: string;
  notes?: string;
  source: "CUSTOMER" | "STAFF";
  status: B2BPaymentStatus;
  recordedById: Types.ObjectId;
  recordedByName?: string;
  verifiedById?: Types.ObjectId;
  verifiedByName?: string;
  verifiedAt?: Date;
  rejectedReason?: string;
  reversedReason?: string;
  /** Bumped by every allocation so racing allocations of one payment conflict instead of spending it twice. */
  allocationSeq: number;
  createdAt: Date;
}
export type B2BPaymentDocument = HydratedDocument<B2BPaymentAttrs>;
const paymentSchema = new Schema<B2BPaymentAttrs>(
  {
    paymentNo: { type: String, required: true, unique: true },
    customerId: { type: Schema.Types.ObjectId, ref: "Customer", required: true, index: true },
    method: { type: String, enum: B2B_PAYMENT_METHODS, required: true },
    amount: { type: Number, required: true, min: 1 },
    receivedDate: { type: String, required: true },
    reference: String,
    bankName: String,
    notes: String,
    source: { type: String, enum: ["CUSTOMER", "STAFF"], required: true },
    status: { type: String, enum: B2B_PAYMENT_STATUSES, required: true, index: true },
    recordedById: { type: Schema.Types.ObjectId, ref: "User", required: true },
    recordedByName: String,
    verifiedById: { type: Schema.Types.ObjectId, ref: "User" },
    verifiedByName: String,
    verifiedAt: Date,
    rejectedReason: String,
    reversedReason: String,
    allocationSeq: { type: Number, default: 0 },
  },
  baseSchemaOptions<B2BPaymentAttrs>()
);
freezePaths(paymentSchema, ["paymentNo", "customerId", "method", "amount", "receivedDate", "source", "recordedById"], "Payment");
export const B2BPaymentModel: Model<B2BPaymentAttrs> = model<B2BPaymentAttrs>("B2BPayment", paymentSchema);

export interface AllocationAttrs {
  paymentId: Types.ObjectId;
  invoiceId: Types.ObjectId;
  customerId: Types.ObjectId;
  amount: number;
  createdById: Types.ObjectId;
  createdAt: Date;
  reversedAt?: Date;
  reversedReason?: string;
}
const allocationSchema = new Schema<AllocationAttrs>(
  {
    paymentId: { type: Schema.Types.ObjectId, ref: "B2BPayment", required: true, index: true },
    invoiceId: { type: Schema.Types.ObjectId, ref: "B2BInvoice", required: true, index: true },
    customerId: { type: Schema.Types.ObjectId, ref: "Customer", required: true, index: true },
    amount: { type: Number, required: true, min: 1 },
    createdById: { type: Schema.Types.ObjectId, ref: "User", required: true },
    reversedAt: Date,
    reversedReason: String,
  },
  baseSchemaOptions<AllocationAttrs>()
);
freezePaths(allocationSchema, ["paymentId", "invoiceId", "customerId", "amount", "createdById"], "Payment allocation");
export const AllocationModel: Model<AllocationAttrs> = model<AllocationAttrs>("B2BPaymentAllocation", allocationSchema);
