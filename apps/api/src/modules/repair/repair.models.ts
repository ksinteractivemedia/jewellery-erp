import { Schema, Types, model, type HydratedDocument, type Model } from "mongoose";
import { REPAIR_ORDER_STATUSES } from "@jewellery/types";
import type { RepairOrderStatus } from "@jewellery/types";
import { baseSchemaOptions } from "../../shared/mongoose.helpers";

export interface WeightSnapshotAttrs {
  grossWeight: number;
  stoneWeight: number;
  netWeight: number;
  at: Date;
}
const weightSnapshotSchema = new Schema<WeightSnapshotAttrs>({ grossWeight: { type: Number, required: true, min: 0 }, stoneWeight: { type: Number, required: true, min: 0 }, netWeight: { type: Number, required: true, min: 0 }, at: { type: Date, required: true } }, { _id: false });

export interface EstimateAttrs {
  labourCharge: number;
  materialsCharge: number;
  otherCharges: number;
  total: number;
  notes?: string;
  estimatedAt: Date;
  estimatedByName?: string;
}
const estimateSchema = new Schema<EstimateAttrs>({ labourCharge: { type: Number, required: true, min: 0 }, materialsCharge: { type: Number, required: true, min: 0 }, otherCharges: { type: Number, required: true, min: 0 }, total: { type: Number, required: true, min: 0 }, notes: String, estimatedAt: { type: Date, required: true }, estimatedByName: String }, { _id: false });

export interface ApprovalAttrs {
  approved: boolean;
  at: Date;
  byName?: string;
  note?: string;
}
const approvalSchema = new Schema<ApprovalAttrs>({ approved: { type: Boolean, required: true }, at: { type: Date, required: true }, byName: String, note: String }, { _id: false });

export interface QcAttrs {
  result: "PASSED" | "FAILED";
  notes?: string;
  at: Date;
  byName?: string;
}
const qcSchema = new Schema<QcAttrs>({ result: { type: String, enum: ["PASSED", "FAILED"], required: true }, notes: String, at: { type: Date, required: true }, byName: String }, { _id: false });

export interface ChargesAttrs {
  labourCharge: number;
  materialsCharge: number;
  otherCharges: number;
  total: number;
}
const chargesSchema = new Schema<ChargesAttrs>({ labourCharge: { type: Number, required: true, min: 0 }, materialsCharge: { type: Number, required: true, min: 0 }, otherCharges: { type: Number, required: true, min: 0 }, total: { type: Number, required: true, min: 0 } }, { _id: false });

export interface HistoryAttrs {
  status: string;
  at: Date;
  by: Types.ObjectId;
  byName?: string;
  note?: string;
}
const historySchema = new Schema<HistoryAttrs>({ status: { type: String, required: true }, at: { type: Date, required: true }, by: { type: Schema.Types.ObjectId, required: true }, byName: String, note: String }, { _id: false });

export interface RepairOrderAttrs {
  createdAt: Date;
  repairNo: string;
  status: RepairOrderStatus;
  customer: { id?: Types.ObjectId; name: string; phone: string; email?: string };
  itemId: Types.ObjectId;
  itemCode: string;
  itemDescription: string;
  metalId?: Types.ObjectId;
  purity?: string;
  huid?: string;
  beforeWeight?: WeightSnapshotAttrs;
  afterWeight?: WeightSnapshotAttrs;
  stoneWork?: string;
  inspectionNotes?: string;
  estimate?: EstimateAttrs;
  approval?: ApprovalAttrs;
  finalCharges?: ChargesAttrs;
  qc?: QcAttrs;
  dueDate?: string;
  readyAt?: Date;
  deliveredAt?: Date;
  history: HistoryAttrs[];
}
export type RepairOrderDocument = HydratedDocument<RepairOrderAttrs>;
const repairOrderSchema = new Schema<RepairOrderAttrs>(
  {
    repairNo: { type: String, required: true, unique: true },
    status: { type: String, enum: REPAIR_ORDER_STATUSES, required: true, default: "INTAKE", index: true },
    customer: { id: { type: Schema.Types.ObjectId, ref: "Customer" }, name: { type: String, required: true }, phone: { type: String, required: true }, email: String },
    itemId: { type: Schema.Types.ObjectId, ref: "InventoryItem", required: true },
    itemCode: { type: String, required: true },
    itemDescription: { type: String, required: true },
    metalId: { type: Schema.Types.ObjectId, ref: "Metal" },
    purity: String,
    huid: String,
    beforeWeight: { type: weightSnapshotSchema },
    afterWeight: { type: weightSnapshotSchema },
    stoneWork: String,
    inspectionNotes: String,
    estimate: { type: estimateSchema },
    approval: { type: approvalSchema },
    finalCharges: { type: chargesSchema },
    qc: { type: qcSchema },
    dueDate: String,
    readyAt: Date,
    deliveredAt: Date,
    history: { type: [historySchema], default: [] },
  },
  baseSchemaOptions<RepairOrderAttrs>()
);
repairOrderSchema.index({ status: 1, createdAt: -1 });
repairOrderSchema.index({ itemId: 1 });
export const RepairOrderModel: Model<RepairOrderAttrs> = model<RepairOrderAttrs>("RepairOrder", repairOrderSchema);
