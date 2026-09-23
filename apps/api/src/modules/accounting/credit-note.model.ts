import { Schema, Types, model, type HydratedDocument, type Model } from "mongoose";
import { CREDIT_NOTE_REASONS, CREDIT_NOTE_STATUSES } from "@jewellery/types";
import type { CreditNoteReason, CreditNoteStatus } from "@jewellery/types";
import { baseSchemaOptions } from "../../shared/mongoose.helpers";

export interface CreditNoteAttrs {
  creditNoteNo: string;
  customerId: Types.ObjectId;
  customerName: string;
  invoiceId?: Types.ObjectId;
  invoiceNo?: string;
  returnId?: Types.ObjectId;
  returnNo?: string;
  reason: CreditNoteReason;
  reasonNote?: string;
  taxableValue: number;
  gst: number;
  total: number;
  status: CreditNoteStatus;
  issueDate: string;
  cancelledReason?: string;
  createdById: Types.ObjectId;
  createdByName?: string;
  createdAt: Date;
}
export type CreditNoteDocument = HydratedDocument<CreditNoteAttrs>;

const creditNoteSchema = new Schema<CreditNoteAttrs>(
  {
    creditNoteNo: { type: String, required: true, unique: true },
    customerId: { type: Schema.Types.ObjectId, ref: "Customer", required: true, index: true },
    customerName: { type: String, required: true },
    invoiceId: { type: Schema.Types.ObjectId, ref: "B2BInvoice" },
    invoiceNo: String,
    returnId: { type: Schema.Types.ObjectId, ref: "Return" },
    returnNo: String,
    reason: { type: String, enum: CREDIT_NOTE_REASONS, required: true },
    reasonNote: String,
    taxableValue: { type: Number, required: true, min: 0 },
    gst: { type: Number, required: true, min: 0 },
    total: { type: Number, required: true, min: 0 },
    status: { type: String, enum: CREDIT_NOTE_STATUSES, required: true, default: "ISSUED" },
    issueDate: { type: String, required: true },
    cancelledReason: String,
    createdById: { type: Schema.Types.ObjectId, ref: "User", required: true },
    createdByName: String,
  },
  baseSchemaOptions<CreditNoteAttrs>()
);
creditNoteSchema.index({ customerId: 1, createdAt: -1 });
export const CreditNoteModel: Model<CreditNoteAttrs> = model<CreditNoteAttrs>("CreditNote", creditNoteSchema);
