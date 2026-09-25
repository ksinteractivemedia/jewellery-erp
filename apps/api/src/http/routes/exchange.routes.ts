import { Router, type Request, type RequestHandler } from "express";
import { PERMISSIONS } from "@jewellery/types";
import { assessExchangeSchema, cancelExchangeSchema, completeExchangeSchema, createExchangeSchema } from "@jewellery/validation";
import * as exchanges from "../../modules/exchange/exchange.service";
import * as reads from "../../modules/exchange/exchange-reads.service";
import type { Actor } from "../../modules/exchange/exchange-store";
import { asyncHandler } from "../middleware/async-handler";
import { requirePermission } from "../middleware/authorize";
import { validateBody } from "../middleware/validate";
import "../context";

const P = PERMISSIONS;

/**
 * Old jewellery → inspection → weight/purity assessment → valuation → new product → difference
 * payable/refundable — staff-only, at the counter. Taking the old piece in posts a real EXCHANGE_IN
 * ledger entry (exchange.service.ts).
 */
export function createExchangeRouter(deps: { authenticate: RequestHandler }) {
  const router = Router();
  router.use(deps.authenticate, (_req, res, next) => (res.set("Cache-Control", "no-store"), next()));
  const view = requirePermission(P.EXCHANGE_VIEW);
  const write = requirePermission(P.EXCHANGE_CREATE);
  const approve = requirePermission(P.EXCHANGE_APPROVE);
  const actor = (req: Express.Request): Actor => ({ id: req.auth!.userId, name: req.auth!.name, ...(req.auth!.email ? { email: req.auth!.email } : {}) });
  const param = (req: Request) => String(req.params.id);

  router.get("/dashboard", view, asyncHandler(async (_req, res) => void res.json(await reads.exchangeDashboard())));
  router.get("/", view, asyncHandler(async (req, res) => void res.json({ items: await exchanges.listExchanges({ ...(typeof req.query.status === "string" ? { status: req.query.status } : {}) }) })));
  router.get("/:id", view, asyncHandler(async (req, res) => void res.json({ exchange: await exchanges.getExchange(param(req)) })));
  router.post("/", write, validateBody(createExchangeSchema), asyncHandler(async (req, res) => void res.status(201).json({ exchange: await exchanges.createExchange(actor(req), req.body) })));
  router.post("/:id/assess", write, validateBody(assessExchangeSchema), asyncHandler(async (req, res) => void res.json({ exchange: await exchanges.assessExchange(param(req), actor(req), req.body) })));
  router.post("/:id/complete", approve, validateBody(completeExchangeSchema), asyncHandler(async (req, res) => void res.json({ exchange: await exchanges.completeExchange(param(req), actor(req), req.body) })));
  router.post("/:id/cancel", write, validateBody(cancelExchangeSchema), asyncHandler(async (req, res) => void res.json({ exchange: await exchanges.cancelExchange(param(req), actor(req), req.body.reason) })));

  return router;
}
