import { Router, type RequestHandler } from "express";
import { PERMISSIONS } from "@jewellery/types";
import { dashboardQuerySchema } from "@jewellery/validation";
import type { DashboardService } from "../../modules/dashboard/dashboard.service";
import { asyncHandler } from "../middleware/async-handler";
import { requireAnyPermission, requirePermission } from "../middleware/authorize";

const { INVENTORY_VIEW, SALES_VIEW, B2B_VIEW, ACCOUNTING_VIEW } = PERMISSIONS;

/**
 * Dashboard sections, one endpoint each so a section loads, fails and is authorised on its own: what you may
 * see is what you may see elsewhere (stock → `inventory.view`, sales → `sales.view`, B2B → `b2b.view`). Margin is
 * further withheld from anyone without `accounting.view`, inside the service — the frontend never gets it to hide.
 * A section whose module does not exist yet answers 200 with `status: "NOT_CONNECTED"`, not an error.
 */
export function createDashboardRouter(deps: { authenticate: RequestHandler; dashboard: DashboardService }) {
  const { dashboard } = deps;
  const router = Router();
  router.use(deps.authenticate);
  const stock = requirePermission(INVENTORY_VIEW);

  router.get("/meta", requireAnyPermission(INVENTORY_VIEW, SALES_VIEW, B2B_VIEW), asyncHandler(async (_req, res) => void res.json(await dashboard.meta())));
  router.get("/sales", requirePermission(SALES_VIEW), asyncHandler(async (req, res) => void res.json(await dashboard.sales(dashboardQuerySchema.parse(req.query), { canSeeMargin: req.auth!.permissions.has(ACCOUNTING_VIEW) }))));
  router.get("/b2b", requirePermission(B2B_VIEW), asyncHandler(async (req, res) => void res.json(await dashboard.b2b(dashboardQuerySchema.parse(req.query)))));
  router.get("/inventory", stock, asyncHandler(async (req, res) => void res.json(await dashboard.inventory(dashboardQuerySchema.parse(req.query)))));
  router.get("/operations", stock, asyncHandler(async (req, res) => void res.json(await dashboard.operations(dashboardQuerySchema.parse(req.query)))));
  router.get("/alerts", stock, asyncHandler(async (req, res) => void res.json(await dashboard.alerts(dashboardQuerySchema.parse(req.query)))));
  router.get("/activity", stock, asyncHandler(async (req, res) => void res.json(await dashboard.activity(dashboardQuerySchema.parse(req.query)))));

  return router;
}
