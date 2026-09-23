import { Router, type Request, type RequestHandler } from "express";
import { PERMISSIONS } from "@jewellery/types";
import {
  arriveHallmarkingBatchSchema,
  cancelHallmarkingBatchSchema,
  createAssayingCentreSchema,
  createHallmarkingBatchSchema,
  failHallmarkingLineSchema,
  receiveHallmarkingBatchSchema,
  updateAssayingCentreSchema,
  verifyHallmarkingLineSchema,
} from "@jewellery/validation";
import * as assayingCentres from "../../modules/hallmarking/assaying-centre.service";
import * as batches from "../../modules/hallmarking/hallmarking-batch.service";
import * as reads from "../../modules/hallmarking/hallmarking-reads.service";
import type { Actor } from "../../modules/hallmarking/hallmarking-store";
import { asyncHandler } from "../middleware/async-handler";
import { requirePermission } from "../middleware/authorize";
import { validateBody } from "../middleware/validate";
import "../context";

const P = PERMISSIONS;

/**
 * Hallmarking: Inventory Item → Send to Hallmarking → In Transit → At Hallmarking Centre → Received →
 * Verified/Failed. Every physical movement is a real inventory ledger entry (see
 * hallmarking-batch.service.ts); assaying centres are configuration data, never hardcoded.
 */
export function createHallmarkingRouter(deps: { authenticate: RequestHandler }) {
  const router = Router();
  router.use(deps.authenticate, (_req, res, next) => (res.set("Cache-Control", "no-store"), next()));
  const view = requirePermission(P.INVENTORY_VIEW);
  const write = requirePermission(P.INVENTORY_CREATE);
  const actor = (req: Express.Request): Actor => ({ id: req.auth!.userId, name: req.auth!.name, ...(req.auth!.email ? { email: req.auth!.email } : {}) });
  const param = (req: Request) => String(req.params.id);

  router.get("/dashboard", view, asyncHandler(async (_req, res) => void res.json(await reads.hallmarkingDashboard())));
  router.get("/items/:itemId/history", view, asyncHandler(async (req, res) => void res.json({ items: await reads.itemHallmarkingHistory(String(req.params.itemId)) })));

  // assaying centres — configuration data
  router.get("/centres", view, asyncHandler(async (_req, res) => void res.json({ items: await assayingCentres.listAssayingCentres() })));
  router.get("/centres/:id", view, asyncHandler(async (req, res) => void res.json({ centre: await assayingCentres.getAssayingCentre(param(req)) })));
  router.post("/centres", write, validateBody(createAssayingCentreSchema), asyncHandler(async (req, res) => void res.status(201).json({ centre: await assayingCentres.createAssayingCentre(req.body) })));
  router.patch("/centres/:id", write, validateBody(updateAssayingCentreSchema), asyncHandler(async (req, res) => void res.json({ centre: await assayingCentres.updateAssayingCentre(param(req), req.body) })));

  // batches
  router.get("/batches", view, asyncHandler(async (req, res) => void res.json({ items: await batches.listHallmarkingBatches({ ...(typeof req.query.status === "string" ? { status: req.query.status } : {}) }) })));
  router.get("/batches/:id", view, asyncHandler(async (req, res) => void res.json({ batch: await batches.getHallmarkingBatch(param(req)) })));
  router.post("/batches", write, validateBody(createHallmarkingBatchSchema), asyncHandler(async (req, res) => void res.status(201).json({ batch: await batches.createHallmarkingBatch(actor(req), req.body) })));
  router.post("/batches/:id/dispatch", write, asyncHandler(async (req, res) => void res.json({ batch: await batches.dispatchHallmarkingBatch(param(req), actor(req)) })));
  router.post("/batches/:id/arrive", write, validateBody(arriveHallmarkingBatchSchema), asyncHandler(async (req, res) => void res.json({ batch: await batches.arriveHallmarkingBatch(param(req), actor(req), req.body.notes) })));
  router.post("/batches/:id/receive", write, validateBody(receiveHallmarkingBatchSchema), asyncHandler(async (req, res) => void res.json({ batch: await batches.receiveHallmarkingBatch(param(req), actor(req), req.body) })));
  router.post("/batches/:id/lines/:itemId/verify", write, validateBody(verifyHallmarkingLineSchema), asyncHandler(async (req, res) => void res.json({ batch: await batches.verifyHallmarkingLine(param(req), String(req.params.itemId), actor(req), req.body.notes) })));
  router.post("/batches/:id/lines/:itemId/fail", write, validateBody(failHallmarkingLineSchema), asyncHandler(async (req, res) => void res.json({ batch: await batches.failHallmarkingLine(param(req), String(req.params.itemId), actor(req), req.body.failureReason) })));
  router.post("/batches/:id/cancel", write, validateBody(cancelHallmarkingBatchSchema), asyncHandler(async (req, res) => void res.json({ batch: await batches.cancelHallmarkingBatch(param(req), actor(req), req.body.reason) })));

  return router;
}
