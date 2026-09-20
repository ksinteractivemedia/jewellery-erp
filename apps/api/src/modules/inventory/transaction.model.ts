import { Schema, Types, model, type HydratedDocument, type Model } from "mongoose";
import type { Transaction } from "@jewellery/types";
import { MOVEMENT_TYPES, REFERENCE_TYPES } from "@jewellery/validation";
import { appendOnlyPlugin } from "../../shared/append-only.plugin";
import { createdAtOnlySchemaOptions } from "../../shared/mongoose.helpers";

export type TransactionAttrs = Omit<Transaction, "id" | "referenceId" | "performedBy"> & {
  referenceId?: Types.ObjectId;
  performedBy: Types.ObjectId;
};
export type TransactionDocument = HydratedDocument<TransactionAttrs>;

const transactionSchema = new Schema<TransactionAttrs>(
  {
    type: { type: String, enum: MOVEMENT_TYPES, required: true },
    channel: { type: String, enum: ["ERP", "B2C", "B2B"], required: true },
    referenceType: { type: String, enum: REFERENCE_TYPES, required: true },
    referenceId: { type: Schema.Types.ObjectId },
    performedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    reason: String,
  },
  createdAtOnlySchemaOptions<TransactionAttrs>()
);

transactionSchema.index({ referenceType: 1, referenceId: 1 });
transactionSchema.index({ performedBy: 1, createdAt: -1 });

transactionSchema.plugin(appendOnlyPlugin, { entityName: "Transaction" });

export const TransactionModel: Model<TransactionAttrs> = model<TransactionAttrs>("Transaction", transactionSchema);
