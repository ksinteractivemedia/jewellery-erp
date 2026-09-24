import { Schema, Types, model, type HydratedDocument, type Model, type Query } from "mongoose";
import { ORDER_STATUSES, type OrderStatus } from "@jewellery/types";
import { ImmutableRecordError } from "../../shared/errors";
import { baseSchemaOptions } from "../../shared/mongoose.helpers";

export interface OrderItemAttrs {
  _id: Types.ObjectId;
  productId: Types.ObjectId;
  variantId?: Types.ObjectId;
  slug: string;
  variantSku?: string;
  sku: string;
  name: string;
  variantLabel?: string;
  imageKey?: string;
  imageAlt?: string;
  quantity: number;
  /** The frozen price of one unit — see PriceSnapshot. The four figures below are its numbers × quantity, copied so an order reads without joins. */
  priceSnapshotId: Types.ObjectId;
  unitPrice: number;
  lineTotal: number;
  taxableValue: number;
  gst: number;
}

export interface OrderAttrs {
  orderNo: string;
  channel: "B2C";
  status: OrderStatus;
  customer: { userId?: Types.ObjectId; fullName: string; email: string; phone: string };
  shippingAddress: { line1: string; line2?: string; city: string; state: string; postalCode: string };
  delivery: { code: string; label: string; fee: number; estimate?: string };
  items: OrderItemAttrs[];
  totals: { taxableValue: number; gst: number; deliveryFee: number; total: number };
  supplyType: "INTRA_STATE" | "INTER_STATE";
  idempotencyKey: string;
  /** Hash of what the customer asked for, so a reused idempotency key with a different bag is refused rather than silently answered. */
  requestHash: string;
  /**
   * The physical pieces set aside for each line. Fulfilment state, not commercial state: which of the identical pieces goes in the
   * box may change (a staff swap), what was sold and for how much may not.
   */
  allocations: { lineId: Types.ObjectId; itemIds: Types.ObjectId[] }[];
  holdExpiresAt?: Date;
  /** The payment attempt that paid for the order. */
  paymentId?: Types.ObjectId;
  placedAt: Date;
  paidAt?: Date;
  cancelledAt?: Date;
  cancelReason?: string;
  statusHistory: { from?: OrderStatus; to: OrderStatus; at: Date; reason?: string }[];
  createdAt: Date;
  updatedAt: Date;
}
export type OrderDocument = HydratedDocument<OrderAttrs>;

const itemSchema = new Schema<OrderItemAttrs>(
  {
    productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    variantId: { type: Schema.Types.ObjectId, ref: "ProductVariant" },
    slug: { type: String, required: true },
    variantSku: String,
    sku: { type: String, required: true },
    name: { type: String, required: true },
    variantLabel: String,
    imageKey: String,
    imageAlt: String,
    quantity: { type: Number, required: true, min: 1 },
    priceSnapshotId: { type: Schema.Types.ObjectId, ref: "PriceSnapshot", required: true },
    unitPrice: { type: Number, required: true, min: 0 },
    lineTotal: { type: Number, required: true, min: 0 },
    taxableValue: { type: Number, required: true, min: 0 },
    gst: { type: Number, required: true, min: 0 },
  },
  { _id: true }
);

const orderSchema = new Schema<OrderAttrs>(
  {
    orderNo: { type: String, required: true, unique: true },
    channel: { type: String, enum: ["B2C"], default: "B2C", required: true },
    status: { type: String, enum: ORDER_STATUSES, required: true, index: true },
    customer: {
      userId: { type: Schema.Types.ObjectId, ref: "User" },
      fullName: { type: String, required: true },
      email: { type: String, required: true, lowercase: true, index: true },
      phone: { type: String, required: true },
    },
    shippingAddress: {
      line1: { type: String, required: true },
      line2: String,
      city: { type: String, required: true },
      state: { type: String, required: true },
      postalCode: { type: String, required: true },
    },
    delivery: { code: { type: String, required: true }, label: { type: String, required: true }, fee: { type: Number, required: true, min: 0 }, estimate: String },
    items: { type: [itemSchema], validate: (v: unknown[]) => v.length > 0 },
    totals: {
      taxableValue: { type: Number, required: true, min: 0 },
      gst: { type: Number, required: true, min: 0 },
      deliveryFee: { type: Number, required: true, min: 0 },
      total: { type: Number, required: true, min: 0 },
    },
    supplyType: { type: String, enum: ["INTRA_STATE", "INTER_STATE"], required: true },
    idempotencyKey: { type: String, required: true, unique: true },
    requestHash: { type: String, required: true },
    allocations: { type: [new Schema({ lineId: { type: Schema.Types.ObjectId, required: true }, itemIds: { type: [Schema.Types.ObjectId], ref: "InventoryItem", required: true } }, { _id: false })], default: [] },
    holdExpiresAt: Date,
    paymentId: { type: Schema.Types.ObjectId, ref: "Payment" },
    placedAt: { type: Date, required: true },
    paidAt: Date,
    cancelledAt: Date,
    cancelReason: String,
    statusHistory: { type: [new Schema({ from: String, to: { type: String, required: true }, at: { type: Date, required: true }, reason: String }, { _id: false })], default: [] },
  },
  baseSchemaOptions<OrderAttrs>()
);
orderSchema.index({ status: 1, holdExpiresAt: 1 });
orderSchema.index({ "customer.userId": 1, placedAt: -1 }, { sparse: true });
/** Sales reports scan paid/confirmed orders within a date range across every customer — the reporting module's own query pattern. */
orderSchema.index({ status: 1, placedAt: -1 });

/**
 * What an order says about WHAT was bought, for how much, to whom and where, is fixed the moment it is created: only its
 * status, hold, payment timestamps and history ever change. Enforced here rather than by convention, so no later code path —
 * a fulfilment screen, a bug — can rewrite a customer's price. Corrections are new documents (credit notes, refunds).
 */
export const IMMUTABLE_ORDER_PATHS = ["orderNo", "channel", "customer", "shippingAddress", "delivery", "items", "totals", "supplyType", "idempotencyKey", "requestHash", "placedAt"] as const;
const isProtected = (key: string) => (IMMUTABLE_ORDER_PATHS as readonly string[]).includes(key.split(".")[0]!);

orderSchema.pre("save", function (next) {
  if (!this.isNew && this.modifiedPaths().some(isProtected)) return next(new ImmutableRecordError("Order (its items, prices, totals, customer and address)"));
  next();
});
for (const op of ["updateOne", "updateMany", "findOneAndUpdate", "replaceOne"] as const) {
  orderSchema.pre(op, { document: false, query: true }, function (this: Query<unknown, unknown>, next) {
    const update = (this.getUpdate() ?? {}) as Record<string, unknown>;
    const keys = Object.entries(update).flatMap(([k, v]) => (k.startsWith("$") && v && typeof v === "object" ? Object.keys(v) : [k]));
    if (keys.some(isProtected)) return next(new ImmutableRecordError("Order (its items, prices, totals, customer and address)"));
    next();
  });
}
for (const op of ["deleteOne", "deleteMany", "findOneAndDelete"] as const) {
  orderSchema.pre(op, { document: false, query: true }, () => {
    throw new ImmutableRecordError("Order");
  });
}

export const OrderModel: Model<OrderAttrs> = model<OrderAttrs>("Order", orderSchema);
