import { Router, type Request, type RequestHandler } from "express";
import { PERMISSIONS } from "@jewellery/types";
import {
  cancelManufacturingSchema,
  completeProductionSchema,
  createJobWorkOrderSchema,
  createProductionOrderSchema,
  issueMaterialSchema,
  qcDecisionSchema,
  rejectQcSchema,
  returnJobWorkSchema,
  submitForQcSchema,
} from "@jewellery/validation";
import * as jobWorkOrders from "../../modules/manufacturing/job-work-order.service";
import * as reads from "../../modules/manufacturing/manufacturing-reads.service";
import type { Actor } from "../../modules/manufacturing/manufacturing-store";
import * as productionOrders from "../../modules/manufacturing/production-order.service";
import { asyncHandler } from "../middleware/async-handler";
import { requirePermission } from "../middleware/authorize";
import { validateBody } from "../middleware/validate";
import "../context";

const P = PERMISSIONS;

/**
 * Manufacturing: production orders and job work, each on its own explicit state machine, wired
 * directly into the inventory ledger (issuing, receiving finished goods and returning unused
 * material are all real ledger entries — see manufacturing-status.ts and the two order services).
 */
export function createManufacturingRouter(deps: { authenticate: RequestHandler }) {
  const router = Router();
  router.use(deps.authenticate, (_req, res, next) => (res.set("Cache-Control", "no-store"), next()));
  const view = requirePermission(P.PRODUCTION_VIEW);
  const create = requirePermission(P.PRODUCTION_CREATE);
  const approve = requirePermission(P.PRODUCTION_APPROVE); // QC decisions and completion
  const actor = (req: Express.Request): Actor => ({ id: req.auth!.userId, name: req.auth!.name, ...(req.auth!.email ? { email: req.auth!.email } : {}) });
  const param = (req: Request) => String(req.params.id);

  router.get("/dashboard", view, asyncHandler(async (_req, res) => void res.json(await reads.manufacturingDashboard())));
  router.get("/reconciliation", view, asyncHandler(async (req, res) => void res.json({ items: await reads.reconciliationRows({ hasDiscrepancy: req.query.discrepancyOnly === "true" ? true : undefined }) })));

  // production orders
  router.get("/production-orders", view, asyncHandler(async (req, res) => void res.json({ items: await productionOrders.listProductionOrders({ ...(typeof req.query.status === "string" ? { status: req.query.status } : {}) }) })));
  router.get("/production-orders/:id", view, asyncHandler(async (req, res) => void res.json({ productionOrder: await productionOrders.getProductionOrder(param(req)) })));
  router.post("/production-orders", create, validateBody(createProductionOrderSchema), asyncHandler(async (req, res) => void res.status(201).json({ productionOrder: await productionOrders.createProductionOrder(actor(req), req.body) })));
  router.post("/production-orders/:id/issue-material", create, validateBody(issueMaterialSchema), asyncHandler(async (req, res) => void res.json({ productionOrder: await productionOrders.issueMaterial(param(req), actor(req), req.body) })));
  router.post("/production-orders/:id/start", create, asyncHandler(async (req, res) => void res.json({ productionOrder: await productionOrders.startManufacturing(param(req), actor(req)) })));
  router.post("/production-orders/:id/submit-qc", create, validateBody(submitForQcSchema), asyncHandler(async (req, res) => void res.json({ productionOrder: await productionOrders.submitForQc(param(req), actor(req), req.body) })));
  router.post("/production-orders/:id/qc/pass", approve, validateBody(qcDecisionSchema), asyncHandler(async (req, res) => void res.json({ productionOrder: await productionOrders.passQc(param(req), actor(req), req.body.notes) })));
  router.post("/production-orders/:id/qc/fail", approve, validateBody(rejectQcSchema), asyncHandler(async (req, res) => void res.json({ productionOrder: await productionOrders.failQc(param(req), actor(req), req.body.notes) })));
  router.post("/production-orders/:id/rework", create, asyncHandler(async (req, res) => void res.json({ productionOrder: await productionOrders.rework(param(req), actor(req)) })));
  router.post("/production-orders/:id/complete", approve, validateBody(completeProductionSchema), asyncHandler(async (req, res) => void res.json({ productionOrder: await productionOrders.completeProduction(param(req), actor(req), req.body) })));
  router.post("/production-orders/:id/cancel", create, validateBody(cancelManufacturingSchema), asyncHandler(async (req, res) => void res.json({ productionOrder: await productionOrders.cancelProduction(param(req), actor(req), req.body.reason) })));

  // job work
  router.get("/job-work-orders", view, asyncHandler(async (req, res) => void res.json({
    items: await jobWorkOrders.listJobWorkOrders({ ...(typeof req.query.status === "string" ? { status: req.query.status } : {}), ...(typeof req.query.vendorId === "string" ? { vendorId: req.query.vendorId } : {}) }),
  })));
  router.get("/job-work-orders/:id", view, asyncHandler(async (req, res) => void res.json({ jobWorkOrder: await jobWorkOrders.getJobWorkOrder(param(req)) })));
  router.post("/job-work-orders", create, validateBody(createJobWorkOrderSchema), asyncHandler(async (req, res) => void res.status(201).json({ jobWorkOrder: await jobWorkOrders.createJobWorkOrder(actor(req), req.body) })));
  router.post("/job-work-orders/:id/issue", create, validateBody(issueMaterialSchema), asyncHandler(async (req, res) => void res.json({ jobWorkOrder: await jobWorkOrders.issueJobWork(param(req), actor(req), req.body.itemIds) })));
  router.post("/job-work-orders/:id/return", approve, validateBody(returnJobWorkSchema), asyncHandler(async (req, res) => void res.json({ jobWorkOrder: await jobWorkOrders.returnJobWork(param(req), actor(req), req.body) })));
  router.post("/job-work-orders/:id/cancel", create, validateBody(cancelManufacturingSchema), asyncHandler(async (req, res) => void res.json({ jobWorkOrder: await jobWorkOrders.cancelJobWork(param(req), actor(req), req.body.reason) })));

  return router;
}
