import { Schema, Types, model, type HydratedDocument, type Model } from "mongoose";
import type { Location } from "@jewellery/types";
import { baseSchemaOptions } from "../../shared/mongoose.helpers";

export type LocationAttrs = Omit<Location, "id" | "branchId"> & { branchId: Types.ObjectId };
export type LocationDocument = HydratedDocument<LocationAttrs>;

const LOCATION_TYPES = [
  "STORE",
  "WAREHOUSE",
  "COUNTER",
  "VAULT",
  "JOB_WORKER",
  "HALLMARKING_CENTER",
  "REPAIR_CENTER",
  "IN_TRANSIT_VIRTUAL",
] as const;

const locationSchema = new Schema<LocationAttrs>(
  {
    branchId: { type: Schema.Types.ObjectId, ref: "Branch", required: true },
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, uppercase: true, trim: true },
    type: { type: String, enum: LOCATION_TYPES, required: true },
    isActive: { type: Boolean, default: true },
  },
  baseSchemaOptions<LocationAttrs>()
);

locationSchema.index({ branchId: 1, code: 1 }, { unique: true });
locationSchema.index({ branchId: 1, type: 1 });

export const LocationModel: Model<LocationAttrs> = model<LocationAttrs>("Location", locationSchema);
