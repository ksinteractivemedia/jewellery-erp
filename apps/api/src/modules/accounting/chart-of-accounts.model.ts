import { Schema, model, type HydratedDocument, type Model } from "mongoose";
import { ACCOUNT_TYPES, SYSTEM_ACCOUNT_ROLES } from "@jewellery/types";
import type { AccountType, SystemAccountRole } from "@jewellery/types";
import { baseSchemaOptions } from "../../shared/mongoose.helpers";

export interface ChartOfAccountAttrs {
  code: string;
  name: string;
  type: AccountType;
  systemRole?: SystemAccountRole;
  description?: string;
  isSystem: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}
export type ChartOfAccountDocument = HydratedDocument<ChartOfAccountAttrs>;

const chartOfAccountSchema = new Schema<ChartOfAccountAttrs>(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    type: { type: String, enum: ACCOUNT_TYPES, required: true },
    systemRole: { type: String, enum: SYSTEM_ACCOUNT_ROLES },
    description: String,
    isSystem: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
  },
  baseSchemaOptions<ChartOfAccountAttrs>()
);
// At most one ACTIVE account may hold a given system role — the posting engine's lookup must never be ambiguous.
chartOfAccountSchema.index({ systemRole: 1, isActive: 1 }, { unique: true, partialFilterExpression: { systemRole: { $exists: true }, isActive: true } });

export const ChartOfAccountModel: Model<ChartOfAccountAttrs> = model<ChartOfAccountAttrs>("ChartOfAccount", chartOfAccountSchema);
