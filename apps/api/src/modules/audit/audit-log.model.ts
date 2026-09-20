import { Schema, Types, model, type Model } from "mongoose";
import type { AuditLogEntry } from "@jewellery/types";
import { appendOnlyPlugin } from "../../shared/append-only.plugin";
import { createdAtOnlySchemaOptions } from "../../shared/mongoose.helpers";

export type AuditLogAttrs = Omit<AuditLogEntry, "id" | "actorId"> & { actorId?: Types.ObjectId };

const auditLogSchema = new Schema<AuditLogAttrs>(
  {
    action: { type: String, required: true },
    outcome: { type: String, enum: ["SUCCESS", "FAILURE", "DENIED"], required: true },
    actorId: { type: Schema.Types.ObjectId, ref: "User" },
    actorEmail: String,
    targetType: String,
    targetId: String,
    metadata: { type: Schema.Types.Mixed },
    ip: String,
    userAgent: { type: String, maxlength: 512 },
    requestId: String,
  },
  createdAtOnlySchemaOptions<AuditLogAttrs>()
);

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ actorId: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });
auditLogSchema.index({ targetType: 1, targetId: 1, createdAt: -1 });
// "everything that touched this inventory item" — bulk operations list their item ids here.
auditLogSchema.index({ "metadata.itemIds": 1, createdAt: -1 }, { sparse: true });

// Security evidence: nothing may rewrite or delete it through the application.
auditLogSchema.plugin(appendOnlyPlugin, { entityName: "AuditLog" });

export const AuditLogModel: Model<AuditLogAttrs> = model<AuditLogAttrs>("AuditLog", auditLogSchema);
