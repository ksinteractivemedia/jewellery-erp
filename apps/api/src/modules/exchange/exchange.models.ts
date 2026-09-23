import { Schema, Types, model, type HydratedDocument, type Model } from "mongoose";
import { EXCHANGE_SETTLEMENT_METHODS, EXCHANGE_STATUSES } from "@jewellery/types";
import type { ExchangeSettlementMethod, ExchangeStatus } from "@jewellery/types";
import { baseSchemaOptions } from "../../shared/mongoose.helpers";

export interface OldJewelleryAssessmentAttrs {
  description: string;
  metalId: Types.ObjectId;
  metalName: string;
  claimedPurity?: string;
  grossWeight: number;
  stoneWeight: number;
  netWeight: number;
  assessedPurity: string;
  assessedFineness: number;
  fineWeight: number;
  ratePerGram: number;
  deduction: number;
  valuation: number;
  notes?: string;
}
const assessmentSchema = new Schema<OldJewelleryAssessmentAttrs>(
  {
    description: { type: String, required: true },
    metalId: { type: Schema.Types.ObjectId, ref: "Metal", required: true },
    metalName: { type: String, required: true },
    claimedPurity: String,
    grossWeight: { type: Number, required: true, min: 0 },
    stoneWeight: { type: Number, required: true, min: 0 },
    netWeight: { type: Number, required: true, min: 0 },
    assessedPurity: { type: String, required: true },
    assessedFineness: { type: Number, required: true, min: 0, max: 1 },
    fineWeight: { type: Number, required: true, min: 0 },
    ratePerGram: { type: Number, required: true, min: 0 },
    deduction: { type: Number, required: true, min: 0, default: 0 },
    valuation: { type: Number, required: true, min: 0 },
    notes: String,
  },
  { _id: false }
);

export interface NewProductAttrs {
  productId: Types.ObjectId;
  variantId?: Types.ObjectId;
  sku: string;
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}
const newProductSchema = new Schema<NewProductAttrs>(
  { productId: { type: Schema.Types.ObjectId, ref: "Product", required: true }, variantId: { type: Schema.Types.ObjectId, ref: "ProductVariant" }, sku: { type: String, required: true }, name: { type: String, required: true }, quantity: { type: Number, required: true, min: 1 }, unitPrice: { type: Number, required: true, min: 0 }, lineTotal: { type: Number, required: true, min: 0 } },
  { _id: false }
);

export interface SettlementAttrs {
  difference: number;
  method?: ExchangeSettlementMethod;
  reference?: string;
  note?: string;
  recordedAt: Date;
  recordedByName?: string;
}
const settlementSchema = new Schema<SettlementAttrs>(
  { difference: { type: Number, required: true }, method: { type: String, enum: EXCHANGE_SETTLEMENT_METHODS }, reference: String, note: String, recordedAt: { type: Date, required: true }, recordedByName: String },
  { _id: false }
);

export interface HistoryAttrs {
  status: string;
  at: Date;
  by: Types.ObjectId;
  byName?: string;
  note?: string;
}
const historySchema = new Schema<HistoryAttrs>({ status: { type: String, required: true }, at: { type: Date, required: true }, by: { type: Schema.Types.ObjectId, required: true }, byName: String, note: String }, { _id: false });

export interface ExchangeAttrs {
  createdAt: Date;
  exchangeNo: string;
  status: ExchangeStatus;
  customer: { id?: Types.ObjectId; name: string; phone?: string; email?: string };
  oldJewellery: OldJewelleryAssessmentAttrs;
  newProduct?: NewProductAttrs;
  oldItemId?: Types.ObjectId;
  orderId?: Types.ObjectId;
  orderNo?: string;
  settlement?: SettlementAttrs;
  notes?: string;
  history: HistoryAttrs[];
}
export type ExchangeDocument = HydratedDocument<ExchangeAttrs>;
const exchangeSchema = new Schema<ExchangeAttrs>(
  {
    exchangeNo: { type: String, required: true, unique: true },
    status: { type: String, enum: EXCHANGE_STATUSES, required: true, default: "DRAFT", index: true },
    customer: { id: { type: Schema.Types.ObjectId, ref: "Customer" }, name: { type: String, required: true }, phone: String, email: String },
    oldJewellery: { type: assessmentSchema, required: true },
    newProduct: { type: newProductSchema },
    oldItemId: { type: Schema.Types.ObjectId, ref: "InventoryItem" },
    orderId: { type: Schema.Types.ObjectId, ref: "Order" },
    orderNo: String,
    settlement: { type: settlementSchema },
    notes: String,
    history: { type: [historySchema], default: [] },
  },
  baseSchemaOptions<ExchangeAttrs>()
);
exchangeSchema.index({ status: 1, createdAt: -1 });
export const ExchangeModel: Model<ExchangeAttrs> = model<ExchangeAttrs>("Exchange", exchangeSchema);
