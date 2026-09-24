import { Router, type RequestHandler } from "express";
import { PERMISSIONS } from "@jewellery/types";
import { reportQuerySchema } from "@jewellery/validation";
import { REPORT_REGISTRY, reportToCsv, runReport, runReportForExport } from "../../modules/reports";
import { asyncHandler } from "../middleware/async-handler";
import { requirePermission } from "../middleware/authorize";
import "../context";

/**
 * The reporting module's own API: a registry (what the ERP's report index page lists) and one
 * generic `/:key` route that dispatches through `runReport` — every report shares this one door,
 * one permission (`reports.view`), one response shape. `/:key/export` streams a CSV rather than
 * handing the browser a huge JSON array to render.
 */
export function createReportsRouter(deps: { authenticate: RequestHandler }) {
  const router = Router();
  router.use(deps.authenticate, (_req, res, next) => (res.set("Cache-Control", "no-store"), next()));
  const view = requirePermission(PERMISSIONS.REPORTS_VIEW);

  router.get("/registry", view, asyncHandler(async (_req, res) => void res.json({ items: REPORT_REGISTRY })));

  router.get("/:key", view, asyncHandler(async (req, res) => void res.json(await runReport(req.params.key!, reportQuerySchema.parse(req.query)))));

  router.get(
    "/:key/export",
    view,
    asyncHandler(async (req, res) => {
      const result = await runReportForExport(req.params.key!, reportQuerySchema.parse(req.query));
      const csv = reportToCsv(result);
      res.set({ "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${result.key}.csv"`, "X-Content-Type-Options": "nosniff" });
      res.send(csv);
    })
  );

  return router;
}
