import { Schema, Types, model, type HydratedDocument, type Model } from "mongoose";
import type { Branch } from "@jewellery/types";
import { addressSchema } from "../../shared/address.schema";
import { baseSchemaOptions } from "../../shared/mongoose.helpers";

/** Ref fields are typed as `Types.ObjectId` here (the runtime shape); the public DTO (`Branch`) types them as `string` — `toDTO` converts between the two. */
export type BranchAttrs = Omit<Branch, "id" | "companyId"> & { companyId: Types.ObjectId };
export type BranchDocument = HydratedDocument<BranchAttrs>;

const branchSchema = new Schema<BranchAttrs>(
  {
    companyId: { type: Schema.Types.ObjectId, ref: "Company", required: true },
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, uppercase: true, trim: true },
    gstin: { type: String, uppercase: true },
    address: { type: addressSchema, required: true },
    contactPhone: String,
    isActive: { type: Boolean, default: true },
  },
  baseSchemaOptions<BranchAttrs>()
);

// A branch code only needs to be unique within its own company.
branchSchema.index({ companyId: 1, code: 1 }, { unique: true });

export const BranchModel: Model<BranchAttrs> = model<BranchAttrs>("Branch", branchSchema);
