import { Schema, model, type HydratedDocument, type Model } from "mongoose";
import type { CustomerGroup } from "@jewellery/types";
import { baseSchemaOptions } from "../../shared/mongoose.helpers";

export type CustomerGroupAttrs = Omit<CustomerGroup, "id">;
export type CustomerGroupDocument = HydratedDocument<CustomerGroupAttrs>;

const customerGroupSchema = new Schema<CustomerGroupAttrs>(
  {
    name: { type: String, required: true, unique: true, trim: true },
    description: String,
    isActive: { type: Boolean, default: true },
  },
  baseSchemaOptions<CustomerGroupAttrs>()
);

export const CustomerGroupModel: Model<CustomerGroupAttrs> = model<CustomerGroupAttrs>("CustomerGroup", customerGroupSchema);
