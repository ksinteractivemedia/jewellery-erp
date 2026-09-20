import { Schema, Types, model, type HydratedDocument, type Model } from "mongoose";

export type SessionRevokeReason = "LOGOUT" | "LOGOUT_ALL" | "PASSWORD_CHANGED" | "PASSWORD_RESET" | "REUSE_DETECTED" | "EXPIRED" | "USER_DEACTIVATED" | "ADMIN_REVOKED";

/**
 * One row per login (a "token family"). The refresh token itself is never stored — only a
 * SHA-256 of its secret half. `previousRefreshTokenHash` is the token we just rotated away
 * from: presenting it again means a copy of the token leaked, and the whole session is killed.
 */
export interface SessionAttrs {
  userId: Types.ObjectId;
  refreshTokenHash: string;
  previousRefreshTokenHash?: string;
  lastUsedAt: Date;
  idleExpiresAt: Date;
  absoluteExpiresAt: Date;
  revokedAt?: Date;
  revokedReason?: SessionRevokeReason;
  ip?: string;
  userAgent?: string;
  /** Mongo TTL target: revoked/expired rows are kept briefly for forensics, then purged. */
  purgeAt: Date;
  createdAt: Date;
}
export type SessionDocument = HydratedDocument<SessionAttrs>;

const sessionSchema = new Schema<SessionAttrs>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    refreshTokenHash: { type: String, required: true },
    previousRefreshTokenHash: String,
    lastUsedAt: { type: Date, required: true },
    idleExpiresAt: { type: Date, required: true },
    absoluteExpiresAt: { type: Date, required: true },
    revokedAt: Date,
    revokedReason: String,
    ip: String,
    userAgent: { type: String, maxlength: 512 },
    purgeAt: { type: Date, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

sessionSchema.index({ purgeAt: 1 }, { expireAfterSeconds: 0 });

export const SessionModel: Model<SessionAttrs> = model<SessionAttrs>("Session", sessionSchema);
