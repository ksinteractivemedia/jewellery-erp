import { Types } from "mongoose";
import { SessionModel, type SessionRevokeReason } from "./session.model";

/** A session that is neither revoked nor past its absolute lifetime. */
export async function findActiveSession(sessionId: string, userId: string) {
  if (!Types.ObjectId.isValid(sessionId)) return null;
  return SessionModel.findOne({ _id: sessionId, userId, revokedAt: null, absoluteExpiresAt: { $gt: new Date() } });
}

export async function revokeSession(sessionId: string, reason: SessionRevokeReason): Promise<boolean> {
  const result = await SessionModel.updateOne({ _id: sessionId, revokedAt: null }, { revokedAt: new Date(), revokedReason: reason });
  return result.modifiedCount > 0;
}

/** Revokes every live session of a user (optionally sparing one — e.g. the caller's own, after a password change). */
export async function revokeAllSessionsForUser(userId: string, reason: SessionRevokeReason, exceptSessionId?: string): Promise<number> {
  const filter: Record<string, unknown> = { userId, revokedAt: null };
  if (exceptSessionId) filter._id = { $ne: exceptSessionId };
  const result = await SessionModel.updateMany(filter, { revokedAt: new Date(), revokedReason: reason });
  return result.modifiedCount;
}
