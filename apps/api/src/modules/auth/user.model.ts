import { Schema, Types, model, type HydratedDocument, type Model } from "mongoose";
import type { User } from "@jewellery/types";
import { baseSchemaOptions } from "../../shared/mongoose.helpers";

export type UserAttrs = Omit<User, "id" | "roleIds" | "customerId" | "branchId"> & {
  roleIds: Types.ObjectId[];
  customerId?: Types.ObjectId;
  branchId?: Types.ObjectId;
  /** Never present on the `User` DTO — see user.repository.ts `toSafeUser`. */
  passwordHash: string;
  failedLoginAttempts: number;
  lockedUntil?: Date;
  passwordChangedAt?: Date;
};
export type UserDocument = HydratedDocument<UserAttrs>;

const USER_TYPES = ["STAFF", "B2B_BUYER", "B2C_CUSTOMER"] as const;

const userSchema = new Schema<UserAttrs>(
  {
    email: { type: String, unique: true, sparse: true, lowercase: true, trim: true },
    phone: { type: String, unique: true, sparse: true, trim: true },
    name: { type: String, required: true, trim: true },
    passwordHash: { type: String, required: true },
    userType: { type: String, enum: USER_TYPES, required: true },
    roleIds: [{ type: Schema.Types.ObjectId, ref: "Role" }],
    customerId: { type: Schema.Types.ObjectId, ref: "Customer" },
    branchId: { type: Schema.Types.ObjectId, ref: "Branch" },
    isActive: { type: Boolean, default: true },
    lastLoginAt: Date,
    failedLoginAttempts: { type: Number, default: 0, min: 0 },
    lockedUntil: Date,
    passwordChangedAt: Date,
  },
  baseSchemaOptions<UserAttrs>()
);

userSchema.index({ userType: 1 });

export const UserModel: Model<UserAttrs> = model<UserAttrs>("User", userSchema);
