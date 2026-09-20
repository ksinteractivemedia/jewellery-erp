import type { RequestHandler } from "express";
import { recordAudit, type AuditAction } from "../../modules/audit/audit.service";
import "../context";

/**
 * Records an audit entry once the response finishes, with the outcome derived from the status
 * code. For sensitive endpoints whose service layer doesn't already audit (reading the audit
 * log itself, future price-override / adjustment routes). Mount after `authenticate`.
 */
export const auditRequest = (action: AuditAction, target?: { type: string; id?: (req: Express.Request) => string | undefined }): RequestHandler =>
  (req, res, next) => {
    res.on("finish", () => {
      void recordAudit({
        action,
        outcome: res.statusCode < 400 ? "SUCCESS" : res.statusCode === 403 ? "DENIED" : "FAILURE",
        actorId: req.auth?.userId,
        actorEmail: req.auth?.email,
        targetType: target?.type,
        targetId: target?.id?.(req),
        metadata: { method: req.method, path: req.originalUrl.split("?")[0], status: res.statusCode },
        ip: req.ctx.ip,
        userAgent: req.ctx.userAgent,
        requestId: req.ctx.requestId,
      });
    });
    next();
  };
