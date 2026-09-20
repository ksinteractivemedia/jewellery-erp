import { Schema, Types, model, type HydratedDocument, type Model } from "mongoose";
import type { Customer } from "@jewellery/types";
import { addressSchema } from "../../shared/address.schema";
import { baseSchemaOptions } from "../../shared/mongoose.helpers";

export type CustomerAttrs = Omit<Customer, "id" | "customerGroupId" | "channelUserId"> & {
  customerGroupId?: Types.ObjectId;
  channelUserId?: Types.ObjectId;
};
export type CustomerDocument = HydratedDocument<CustomerAttrs>;

const customerSchema = new Schema<CustomerAttrs>(
  {
    type: { type: String, enum: ["B2C", "B2B"], required: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, lowercase: true, trim: true, sparse: true },
    phone: { type: String, trim: true, sparse: true },
    gstin: { type: String, uppercase: true },
    customerGroupId: { type: Schema.Types.ObjectId, ref: "CustomerGroup" },
    billingAddress: { type: addressSchema },
    shippingAddresses: { type: [addressSchema], default: [] },
    channelUserId: { type: Schema.Types.ObjectId, ref: "User" },
    isActive: { type: Boolean, default: true },
  },
  baseSchemaOptions<CustomerAttrs>()
);

// A customer's own contact details need not be globally unique (shared family phone,
// walk-in customers with no email) — but the same email/phone shouldn't appear twice
// as a *distinct* customer record of the same type.
customerSchema.index({ type: 1, email: 1 }, { unique: true, partialFilterExpression: { email: { $type: "string" } } });
customerSchema.index({ type: 1, phone: 1 }, { unique: true, partialFilterExpression: { phone: { $type: "string" } } });
customerSchema.index({ customerGroupId: 1 });

export const CustomerModel: Model<CustomerAttrs> = model<CustomerAttrs>("Customer", customerSchema);
