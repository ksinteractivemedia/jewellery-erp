import { Schema, Types, model, type HydratedDocument, type Model } from "mongoose";
import { RETURN_CHANNELS, RETURN_CONDITIONS, RETURN_REASONS, RETURN_SETTLEMENT_METHODS, RETURN_STATUSES } from "@jewellery/types";
import type { ReturnChannel, ReturnCondition, ReturnReason, ReturnSettlementMethod, ReturnStatus } from "@jewellery/types";
import { baseSchemaOptions } from "../../shared/mongoose.helpers";

export interface ReturnLineAttrs {
  itemId: Types.ObjectId;
  itemCode: string;
  sku: string;
  name: string;
  orderLineRef: string;
  huid?: string;
  grossWeight: number;
  unitPrice: number;
  weightDiscrepancyNote?: string;
  condition?: ReturnCondition;
  conditionNote?: string;
}
const returnLineSchema = new Schema<ReturnLineAttrs>(
  {
    itemId: { type: Schema.Types.ObjectId, ref: "InventoryItem", required: true },
    itemCode: { type: String, required: true },
    sku: { type: String, required: true },
    name: { type: String, required: true },
    orderLineRef: { type: String, required: true },
    huid: String,
    grossWeight: { type: Number, required: true, min: 0 },
    unitPrice: { type: Number, required: true, min: 0 },
    weightDiscrepancyNote: String,
    condition: { type: String, enum: RETURN_CONDITIONS },
    conditionNote: String,
  },
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

export interface SettlementAttrs {
  method: ReturnSettlementMethod;
  amount: number;
  reference?: string;
  note?: string;
  recordedAt: Date;
  recordedByName?: string;
}
const settlementSchema = new Schema<SettlementAttrs>(
  { method: { type: String, enum: RETURN_SETTLEMENT_METHODS, required: true }, amount: { type: Number, required: true, min: 0 }, reference: String, note: String, recordedAt: { type: Date, required: true }, recordedByName: String },
  { _id: false }
);

export interface ReturnAttrs {
  createdAt: Date;
  returnNo: string;
  channel: ReturnChannel;
  status: ReturnStatus;
  orderId: Types.ObjectId;
  orderNo: string;
  customer: { id?: Types.ObjectId; name: string; email?: string; phone?: string };
  reason: ReturnReason;
  reasonNote?: string;
  lines: ReturnLineAttrs[];
  rejectedReason?: string;
  receivedAt?: Date;
  inspectedAt?: Date;
  settlement?: SettlementAttrs;
  refundableTotal: number;
  history: HistoryAttrs[];
}
export type ReturnDocument = HydratedDocument<ReturnAttrs>;
const returnSchema = new Schema<ReturnAttrs>(
  {
    returnNo: { type: String, required: true, unique: true },
    channel: { type: String, enum: RETURN_CHANNELS, required: true },
    status: { type: String, enum: RETURN_STATUSES, required: true, default: "REQUESTED", index: true },
    orderId: { type: Schema.Types.ObjectId, required: true, index: true },
    orderNo: { type: String, required: true },
    customer: { id: { type: Schema.Types.ObjectId, ref: "Customer" }, name: { type: String, required: true }, email: String, phone: String },
    reason: { type: String, enum: RETURN_REASONS, required: true },
    reasonNote: String,
    lines: { type: [returnLineSchema], validate: (v: unknown[]) => v.length > 0 },
    rejectedReason: String,
    receivedAt: Date,
    inspectedAt: Date,
    settlement: { type: settlementSchema },
    refundableTotal: { type: Number, required: true, min: 0 },
    history: { type: [historySchema], default: [] },
  },
  baseSchemaOptions<ReturnAttrs>()
);
returnSchema.index({ orderId: 1, createdAt: -1 });
returnSchema.index({ "lines.itemId": 1 });
export const ReturnModel: Model<ReturnAttrs> = model<ReturnAttrs>("Return", returnSchema);
