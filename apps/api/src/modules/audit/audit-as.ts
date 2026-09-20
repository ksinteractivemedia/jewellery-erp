import type { RequestMeta } from "../auth/auth.service";
import type { AuthContext } from "../auth/authorization.service";
import { recordAudit, type AuditAction } from "./audit.service";

/** One audit call shape for any successful mutation by a signed-in user: actor and request metadata are never forgotten at a call site. */
export const auditAs = (
  actor: AuthContext,
  meta: RequestMeta,
  action: AuditAction,
  targetType: string,
  targetId: string | undefined,
  metadata?: Record<string, unknown>
) =>
  recordAudit({
    action,
    outcome: "SUCCESS",
    actorId: actor.userId,
    actorEmail: actor.email,
    targetType,
    targetId,
    metadata,
    ip: meta.ip,
    userAgent: meta.userAgent,
    requestId: meta.requestId,
  });
