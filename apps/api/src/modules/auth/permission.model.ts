import { Schema, model, type HydratedDocument, type Model } from "mongoose";
import type { Permission } from "@jewellery/types";
import { baseSchemaOptions } from "../../shared/mongoose.helpers";

export type PermissionAttrs = Omit<Permission, "id">;
export type PermissionDocument = HydratedDocument<PermissionAttrs>;

const permissionSchema = new Schema<PermissionAttrs>(
  {
    key: { type: String, required: true, unique: true, lowercase: true, trim: true },
    module: { type: String, required: true, lowercase: true, trim: true },
    action: { type: String, required: true, lowercase: true, trim: true },
    description: String,
  },
  baseSchemaOptions<PermissionAttrs>()
);

permissionSchema.index({ module: 1, action: 1 });

export const PermissionModel: Model<PermissionAttrs> = model<PermissionAttrs>("Permission", permissionSchema);
