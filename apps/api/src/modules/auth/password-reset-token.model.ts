import { Schema, Types, model, type Model } from "mongoose";

export interface PasswordResetTokenAttrs {
  userId: Types.ObjectId;
  /** SHA-256 of the secret half of the emailed token. The token itself is never stored. */
  tokenHash: string;
  expiresAt: Date;
  usedAt?: Date;
  ip?: string;
  createdAt: Date;
}

const schema = new Schema<PasswordResetTokenAttrs>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    tokenHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    usedAt: Date,
    ip: String,
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// Expired tokens are useless the moment they lapse; let Mongo clean them up a day later.
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 86_400 });

export const PasswordResetTokenModel: Model<PasswordResetTokenAttrs> = model<PasswordResetTokenAttrs>("PasswordResetToken", schema);
