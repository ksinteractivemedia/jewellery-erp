import { Schema, model, type HydratedDocument, type Model } from "mongoose";
import type { Company } from "@jewellery/types";
import { addressSchema } from "../../shared/address.schema";
import { baseSchemaOptions } from "../../shared/mongoose.helpers";

export type CompanyAttrs = Omit<Company, "id">;
export type CompanyDocument = HydratedDocument<CompanyAttrs>;

const companySchema = new Schema<CompanyAttrs>(
  {
    name: { type: String, required: true, trim: true },
    legalName: { type: String, required: true, trim: true },
    gstin: { type: String, unique: true, sparse: true, uppercase: true },
    pan: { type: String, uppercase: true },
    address: { type: addressSchema, required: true },
    contactEmail: { type: String, lowercase: true, trim: true },
    contactPhone: String,
    isActive: { type: Boolean, default: true },
  },
  baseSchemaOptions<CompanyAttrs>()
);

export const CompanyModel: Model<CompanyAttrs> = model<CompanyAttrs>("Company", companySchema);
