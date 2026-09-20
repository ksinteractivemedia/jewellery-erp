import { Schema, model, type HydratedDocument, type Model } from "mongoose";
import type { Supplier } from "@jewellery/types";
import { addressSchema } from "../../shared/address.schema";
import { baseSchemaOptions } from "../../shared/mongoose.helpers";

export type SupplierAttrs = Omit<Supplier, "id">;
export type SupplierDocument = HydratedDocument<SupplierAttrs>;

const supplierSchema = new Schema<SupplierAttrs>(
  {
    name: { type: String, required: true, trim: true },
    gstin: { type: String, unique: true, sparse: true, uppercase: true },
    contactName: String,
    contactEmail: { type: String, lowercase: true, trim: true },
    contactPhone: String,
    address: { type: addressSchema },
    paymentTermsDays: { type: Number, default: 0, min: 0 },
    isActive: { type: Boolean, default: true },
  },
  baseSchemaOptions<SupplierAttrs>()
);

export const SupplierModel: Model<SupplierAttrs> = model<SupplierAttrs>("Supplier", supplierSchema);
