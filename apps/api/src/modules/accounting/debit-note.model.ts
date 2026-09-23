import { Schema, Types, model, type HydratedDocument, type Model } from "mongoose";
import { DEBIT_NOTE_REASONS } from "@jewellery/types";
import type { DebitNoteReason } from "@jewellery/types";
import { baseSchemaOptions } from "../../shared/mongoose.helpers";

export interface DebitNoteAttrs {
  debitNoteNo: string;
  supplierId: Types.ObjectId;
  supplierName: string;
  supplierInvoiceId?: Types.ObjectId;
  supplierInvoiceNo?: string;
  reason: DebitNoteReason;
  reasonNote?: string;
  taxableValue: number;
  gst: number;
  total: number;
  status: "ISSUED" | "CANCELLED";
  issueDate: string;
  cancelledReason?: string;
  createdById: Types.ObjectId;
  createdByName?: string;
  createdAt: Date;
}
export type DebitNoteDocument = HydratedDocument<DebitNoteAttrs>;

const debitNoteSchema = new Schema<DebitNoteAttrs>(
  {
    debitNoteNo: { type: String, required: true, unique: true },
    supplierId: { type: Schema.Types.ObjectId, ref: "Supplier", required: true, index: true },
    supplierName: { type: String, required: true },
    supplierInvoiceId: { type: Schema.Types.ObjectId, ref: "SupplierInvoice" },
    supplierInvoiceNo: String,
    reason: { type: String, enum: DEBIT_NOTE_REASONS, required: true },
    reasonNote: String,
    taxableValue: { type: Number, required: true, min: 0 },
    gst: { type: Number, required: true, min: 0 },
    total: { type: Number, required: true, min: 0 },
    status: { type: String, enum: ["ISSUED", "CANCELLED"], required: true, default: "ISSUED" },
    issueDate: { type: String, required: true },
    cancelledReason: String,
    createdById: { type: Schema.Types.ObjectId, ref: "User", required: true },
    createdByName: String,
  },
  baseSchemaOptions<DebitNoteAttrs>()
);
debitNoteSchema.index({ supplierId: 1, createdAt: -1 });
export const DebitNoteModel: Model<DebitNoteAttrs> = model<DebitNoteAttrs>("DebitNote", debitNoteSchema);
