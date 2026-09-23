import { Router, type Request, type RequestHandler } from "express";
import { PERMISSIONS } from "@jewellery/types";
import {
  cancelRepairSchema,
  decideRepairEstimateSchema,
  deliverRepairSchema,
  estimateRepairSchema,
  inspectRepairSchema,
  recordRepairWorkSchema,
  repairIntakeSchema,
  repairQcDecisionSchema,
} from "@jewellery/validation";
import * as repairs from "../../modules/repair/repair-order.service";
import * as reads from "../../modules/repair/repair-reads.service";
import type { Actor } from "../../modules/repair/repair-store";
import { asyncHandler } from "../middleware/async-handler";
import { requirePermission } from "../middleware/authorize";
import { validateBody } from "../middleware/validate";
import "../context";

const P = PERMISSIONS;

/**
 * Customer → repair intake → inspection → estimate → approval → repair → QC → ready →
 * delivery/pickup. Every physical movement is a real inventory ledger entry
 * (repair-order.service.ts) — intake takes the piece into custody, delivery/decline/cancel always
 * hand it back, never onto sellable AVAILABLE stock.
 */
export function createRepairRouter(deps: { authenticate: RequestHandler }) {
  const router = Router();
  router.use(deps.authenticate, (_req, res, next) => (res.set("Cache-Control", "no-store"), next()));
  const view = requirePermission(P.REPAIR_VIEW);
  const write = requirePermission(P.REPAIR_CREATE);
  const qc = requirePermission(P.REPAIR_APPROVE);
  const actor = (req: Express.Request): Actor => ({ id: req.auth!.userId, name: req.auth!.name, ...(req.auth!.email ? { email: req.auth!.email } : {}) });
  const param = (req: Request) => String(req.params.id);

  router.get("/dashboard", view, asyncHandler(async (_req, res) => void res.json(await reads.repairDashboard())));
  router.get("/", view, asyncHandler(async (req, res) => void res.json({ items: await repairs.listRepairOrders({ ...(typeof req.query.status === "string" ? { status: req.query.status } : {}) }) })));
  router.get("/:id", view, asyncHandler(async (req, res) => void res.json({ repair: await repairs.getRepairOrder(param(req)) })));

  router.post("/", write, validateBody(repairIntakeSchema), asyncHandler(async (req, res) => void res.status(201).json({ repair: await repairs.intakeRepair(actor(req), req.body) })));
  router.post("/:id/inspect", write, validateBody(inspectRepairSchema), asyncHandler(async (req, res) => void res.json({ repair: await repairs.inspectRepair(param(req), actor(req), req.body) })));
  router.post("/:id/estimate", write, validateBody(estimateRepairSchema), asyncHandler(async (req, res) => void res.json({ repair: await repairs.estimateRepair(param(req), actor(req), req.body) })));
  router.post("/:id/estimate/decide", write, validateBody(decideRepairEstimateSchema), asyncHandler(async (req, res) => void res.json({ repair: await repairs.decideRepairEstimate(param(req), actor(req), req.body) })));
  router.post("/:id/start", write, asyncHandler(async (req, res) => void res.json({ repair: await repairs.startRepair(param(req), actor(req)) })));
  router.post("/:id/work", write, validateBody(recordRepairWorkSchema), asyncHandler(async (req, res) => void res.json({ repair: await repairs.recordRepairWork(param(req), actor(req), req.body) })));
  router.post("/:id/qc/pass", qc, validateBody(repairQcDecisionSchema), asyncHandler(async (req, res) => void res.json({ repair: await repairs.passRepairQc(param(req), actor(req), req.body) })));
  router.post("/:id/qc/fail", qc, validateBody(repairQcDecisionSchema), asyncHandler(async (req, res) => void res.json({ repair: await repairs.failRepairQc(param(req), actor(req), req.body) })));
  router.post("/:id/rework", write, validateBody(cancelRepairSchema.partial()), asyncHandler(async (req, res) => void res.json({ repair: await repairs.reworkRepair(param(req), actor(req), req.body?.reason) })));
  router.post("/:id/deliver", write, validateBody(deliverRepairSchema), asyncHandler(async (req, res) => void res.json({ repair: await repairs.deliverRepair(param(req), actor(req), req.body) })));
  router.post("/:id/cancel", write, validateBody(cancelRepairSchema), asyncHandler(async (req, res) => void res.json({ repair: await repairs.cancelRepair(param(req), actor(req), req.body.reason) })));

  return router;
}
