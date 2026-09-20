import type { Id } from "./common";
import type { PermissionKey } from "./rbac";
import type { UserType } from "./user";

/** What a signed-in client is allowed to know about itself. Permissions here drive UI only — the API enforces them independently. */
export interface AuthUser {
  id: Id;
  name: string;
  email?: string;
  userType: UserType;
  roles: string[];
  permissions: PermissionKey[];
}

/** Response of login / refresh. The refresh token is never in the body — it lives in an httpOnly cookie. */
export interface AuthSession {
  accessToken: string;
  /** Seconds until `accessToken` expires. */
  expiresIn: number;
  user: AuthUser;
}

export type AuditOutcome = "SUCCESS" | "FAILURE" | "DENIED";

/** Append-only record of a security-relevant event. */
export interface AuditLogEntry {
  id: Id;
  action: string;
  outcome: AuditOutcome;
  actorId?: Id;
  actorEmail?: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
  requestId?: string;
  createdAt: Date;
}
