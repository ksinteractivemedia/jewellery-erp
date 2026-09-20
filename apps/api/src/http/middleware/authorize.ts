import type { RequestHandler } from "express";
import type { PermissionKey } from "@jewellery/types";
import { AuthenticationError, AuthorizationError } from "../../shared/errors";
import { AUDIT_ACTIONS, recordAudit } from "../../modules/audit/audit.service";
import { hasAll, hasAny, type Policy } from "../../modules/auth/authorization.service";
import { asyncHandler } from "./async-handler";
import "../context";

/**
 * The single authorization primitive. A route declares a *policy* (a predicate over the
 * caller's permissions); it never inspects roles. A denial is audited and answered 403 — the
 * handler behind it is never reached. Must be mounted after `authenticate`.
 */
export function authorize(policy: Policy<Express.Request>, required: string[] = []): RequestHandler {
  return asyncHandler(async (req, _res, next) => {
    if (!req.auth) throw new AuthenticationError();
    if (!(await policy(req.auth, req))) {
      await recordAudit({
        action: AUDIT_ACTIONS.ACCESS_DENIED,
        outcome: "DENIED",
        actorId: req.auth.userId,
        actorEmail: req.auth.email,
        metadata: { method: req.method, path: req.originalUrl.split("?")[0], required },
        ip: req.ctx.ip,
        userAgent: req.ctx.userAgent,
        requestId: req.ctx.requestId,
      });
      throw new AuthorizationError();
    }
    next();
  });
}

/** Caller must hold ALL of these permissions. */
export const requirePermission = (...keys: PermissionKey[]) => authorize(hasAll(...keys), keys);

/** Caller must hold AT LEAST ONE of these permissions. */
export const requireAnyPermission = (...keys: PermissionKey[]) => authorize(hasAny(...keys), keys);
