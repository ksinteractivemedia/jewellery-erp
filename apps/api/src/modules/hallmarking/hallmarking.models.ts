import { Schema, Types, model, type HydratedDocument, type Model } from "mongoose";
import { HALLMARKING_BATCH_STATUSES, HALLMARKING_LINE_OUTCOMES, type HallmarkingBatchStatus, type HallmarkingLineOutcome } from "@jewellery/types";
import { addressSchema } from "../../shared/address.schema";
import { baseSchemaOptions } from "../../shared/mongoose.helpers";

// ---- assaying centre — reference data, never a hardcoded list -------------------------------------------
export interface AssayingCentreAttrs {
  createdAt: Date;
  name: string;
  code: string;
  bisRegistrationNumber?: string;
  locationId: Types.ObjectId;
  locationName: string;
  address?: unknown;
  contactPhone?: string;
  contactEmail?: string;
  isActive: boolean;
}
const assayingCentreSchema = new Schema<AssayingCentreAttrs>(
  {
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    bisRegistrationNumber: String,
    locationId: { type: Schema.Types.ObjectId, ref: "Location", required: true },
    locationName: { type: String, required: true },
    address: { type: addressSchema },
    contactPhone: String,
    contactEmail: { type: String, lowercase: true, trim: true },
    isActive: { type: Boolean, default: true },
  },
  baseSchemaOptions<AssayingCentreAttrs>()
);
export const AssayingCentreModel: Model<AssayingCentreAttrs> = model<AssayingCentreAttrs>("AssayingCentre", assayingCentreSchema);

// ---- hallmarking batch -------------------------------------------------------------------------------------
export interface HallmarkingLineAttrs {
  itemId: Types.ObjectId;
  itemCode: string;
  purity: string;
  grossWeight: number;
  fromLocationId: Types.ObjectId;
  huid?: string;
  certificateNumber?: string;
  hallmarkDate?: string;
  outcome?: HallmarkingLineOutcome;
  failureReason?: string;
}
const hallmarkingLineSchema = new Schema<HallmarkingLineAttrs>(
  {
    itemId: { type: Schema.Types.ObjectId, ref: "InventoryItem", required: true },
    itemCode: { type: String, required: true },
    purity: { type: String, required: true },
    grossWeight: { type: Number, required: true, min: 0 },
    fromLocationId: { type: Schema.Types.ObjectId, ref: "Location", required: true },
    huid: String,
    certificateNumber: String,
    hallmarkDate: String,
    outcome: { type: String, enum: HALLMARKING_LINE_OUTCOMES },
    failureReason: String,
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

export interface HallmarkingBatchAttrs {
  createdAt: Date;
  hallmarkingNo: string;
  status: HallmarkingBatchStatus;
  assayingCentreId: Types.ObjectId;
  assayingCentreName: string;
  sentDate?: string;
  expectedReturnDate?: string;
  notes?: string;
  lines: HallmarkingLineAttrs[];
  history: HistoryAttrs[];
}
export type HallmarkingBatchDocument = HydratedDocument<HallmarkingBatchAttrs>;
const hallmarkingBatchSchema = new Schema<HallmarkingBatchAttrs>(
  {
    hallmarkingNo: { type: String, required: true, unique: true },
    status: { type: String, enum: HALLMARKING_BATCH_STATUSES, required: true, default: "PENDING" },
    assayingCentreId: { type: Schema.Types.ObjectId, ref: "AssayingCentre", required: true },
    assayingCentreName: { type: String, required: true },
    sentDate: String,
    expectedReturnDate: String,
    notes: String,
    lines: { type: [hallmarkingLineSchema], required: true },
    history: { type: [historySchema], default: [] },
  },
  baseSchemaOptions<HallmarkingBatchAttrs>()
);
hallmarkingBatchSchema.index({ status: 1, createdAt: -1 });
hallmarkingBatchSchema.index({ "lines.itemId": 1 });
export const HallmarkingBatchModel: Model<HallmarkingBatchAttrs> = model<HallmarkingBatchAttrs>("HallmarkingBatch", hallmarkingBatchSchema);
