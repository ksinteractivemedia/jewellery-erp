import { Schema, Types, model, type HydratedDocument, type Model } from "mongoose";
import { PAYMENT_STATUSES, type PaymentStatus, type RefundStatus } from "@jewellery/types";
import { baseSchemaOptions } from "../../shared/mongoose.helpers";

export interface RefundAttrs {
  _id: Types.ObjectId;
  amount: number;
  status: RefundStatus;
  reason: string;
  idempotencyKey: string;
  providerRefundRef?: string;
  failureReason?: string;
  createdAt: Date;
}
export interface PaymentAttrs {
  orderId: Types.ObjectId;
  provider: string;
  /** The provider's id for this payment; set once initiate() returns. */
  providerRef?: string;
  /** What was asked for — always the order's total. */
  amount: number;
  currency: "INR";
  status: PaymentStatus;
  /** What the provider says it actually took. Compared with `amount` before an order is treated as paid. */
  capturedAmount: number;
  capturedAt?: Date;
  /** What has actually gone back to the customer (refunds that succeeded). */
  refundedAmount: number;
  method?: string;
  failureReason?: string;
  refunds: RefundAttrs[];
  attempt: number;
  idempotencyKey: string;
  createdAt: Date;
  updatedAt: Date;
}
export type PaymentDocument = HydratedDocument<PaymentAttrs>;

const refundSchema = new Schema<RefundAttrs>(
  {
    amount: { type: Number, required: true, min: 1 },
    status: { type: String, enum: ["PENDING", "SUCCEEDED", "FAILED"], required: true },
    reason: { type: String, required: true },
    idempotencyKey: { type: String, required: true },
    providerRefundRef: String,
    failureReason: String,
    createdAt: { type: Date, default: () => new Date() },
  },
  { _id: true }
);

/** One attempt to pay for an order. An order can have several (the first failed, the customer tried again); at most one succeeds. */
const paymentSchema = new Schema<PaymentAttrs>(
  {
    orderId: { type: Schema.Types.ObjectId, ref: "Order", required: true, index: true },
    provider: { type: String, required: true },
    providerRef: String,
    amount: { type: Number, required: true, min: 1 },
    currency: { type: String, enum: ["INR"], default: "INR" },
    status: { type: String, enum: PAYMENT_STATUSES, required: true, default: "PENDING" },
    capturedAmount: { type: Number, default: 0, min: 0 },
    capturedAt: Date,
    refundedAmount: { type: Number, default: 0, min: 0 },
    method: String,
    failureReason: String,
    refunds: { type: [refundSchema], default: [] },
    attempt: { type: Number, required: true, min: 1 },
    idempotencyKey: { type: String, required: true },
  },
  baseSchemaOptions<PaymentAttrs>()
);
paymentSchema.index({ provider: 1, providerRef: 1 }, { unique: true, partialFilterExpression: { providerRef: { $type: "string" } } });
paymentSchema.index({ orderId: 1, attempt: 1 }, { unique: true });
paymentSchema.index({ idempotencyKey: 1 }, { unique: true });

export const PaymentModel: Model<PaymentAttrs> = model<PaymentAttrs>("Payment", paymentSchema);

/**
 * Every webhook delivery, recorded before it is acted on. The unique (provider, eventId) is what makes a redelivered webhook
 * harmless: the second arrival finds the first already applied and does nothing.
 */
export interface PaymentEventAttrs {
  provider: string;
  eventId: string;
  type: string;
  providerRef: string;
  amount?: number;
  receivedAt: Date;
  processedAt?: Date;
  outcome?: "APPLIED" | "IGNORED";
  note?: string;
}
const paymentEventSchema = new Schema<PaymentEventAttrs>(
  {
    provider: { type: String, required: true },
    eventId: { type: String, required: true },
    type: { type: String, required: true },
    providerRef: { type: String, required: true },
    amount: Number,
    receivedAt: { type: Date, required: true, default: () => new Date() },
    processedAt: Date,
    outcome: { type: String, enum: ["APPLIED", "IGNORED"] },
    note: String,
  },
  { versionKey: false }
);
paymentEventSchema.index({ provider: 1, eventId: 1 }, { unique: true });
export const PaymentEventModel: Model<PaymentEventAttrs> = model<PaymentEventAttrs>("PaymentEvent", paymentEventSchema);
