import { Schema, Types, model, type HydratedDocument, type Model } from "mongoose";
import type { Role } from "@jewellery/types";
import { baseSchemaOptions } from "../../shared/mongoose.helpers";

export type RoleAttrs = Omit<Role, "id" | "permissionIds"> & { permissionIds: Types.ObjectId[] };
export type RoleDocument = HydratedDocument<RoleAttrs>;

const roleSchema = new Schema<RoleAttrs>(
  {
    name: { type: String, required: true, unique: true, trim: true },
    description: String,
    permissionIds: [{ type: Schema.Types.ObjectId, ref: "Permission" }],
    isSystem: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
  },
  baseSchemaOptions<RoleAttrs>()
);

export const RoleModel: Model<RoleAttrs> = model<RoleAttrs>("Role", roleSchema);
