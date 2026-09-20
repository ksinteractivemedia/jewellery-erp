import { Router, type RequestHandler } from "express";
import { PERMISSIONS } from "@jewellery/types";
import { AUDIT_ACTIONS, listAuditLogs } from "../../modules/audit/audit.service";
import { asyncHandler } from "../middleware/async-handler";
import { auditRequest } from "../middleware/audit-request";
import { requirePermission } from "../middleware/authorize";

export function createAuditRouter(deps: { authenticate: RequestHandler }) {
  const router = Router();
  // Reading the audit log is itself a sensitive operation, so it is audited too.
  router.get(
    "/",
    deps.authenticate,
    requirePermission(PERMISSIONS.SETTINGS_VIEW_AUDIT_LOGS),
    auditRequest(AUDIT_ACTIONS.AUDIT_LOG_VIEWED),
    asyncHandler(async (req, res) => {
      const q = req.query;
      const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);
      const outcome = str(q.outcome);
      res.json({
        entries: await listAuditLogs({
          action: str(q.action),
          actorId: str(q.actorId),
          outcome: outcome === "SUCCESS" || outcome === "FAILURE" || outcome === "DENIED" ? outcome : undefined,
          targetType: str(q.targetType),
          targetId: str(q.targetId),
          before: str(q.before),
          limit: q.limit ? Number(q.limit) : undefined,
        }),
      });
    })
  );
  return router;
}
