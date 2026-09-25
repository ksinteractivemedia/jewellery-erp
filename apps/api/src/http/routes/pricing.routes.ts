import { Router, type RequestHandler } from "express";
import { z } from "zod";
import { PERMISSIONS } from "@jewellery/types";
import { createMetalRateSchema, pricingPreviewSchema, zId } from "@jewellery/validation";
import type { PricingPreviewService } from "../../modules/pricing/pricing-preview.service";
import { createMetalRate, findCurrentRate, listRateHistory } from "../../modules/metals/metal-rate.repository";
import { asyncHandler } from "../middleware/async-handler";
import { requirePermission } from "../middleware/authorize";
import { validateBody } from "../middleware/validate";

const rateQuerySchema = z.object({ metalId: zId, purity: z.string().trim().min(1) });

/**
 * Internal pricing playground, plus real metal-rate entry — the one thing everything else in the system
 * (checkout, the B2B catalogue, every report) prices against. `pricing.manage` (not `pricing.view`): the
 * breakdown can include cost and margin, and rate entry moves what every customer is charged — neither is
 * for every staff role. There is deliberately no route that prices a real order or stores a PriceSnapshot
 * directly here — that happens inside checkout/B2B, reading the rate this route lets someone set.
 */
export function createPricingRouter(deps: { authenticate: RequestHandler; preview: PricingPreviewService }) {
  const { preview } = deps;
  const router = Router();
  router.use(deps.authenticate);
  const view = requirePermission(PERMISSIONS.PRICING_VIEW);
  const manage = requirePermission(PERMISSIONS.PRICING_MANAGE);

  router.get("/meta", manage, asyncHandler(async (_req, res) => void res.json(await preview.meta())));
  router.post("/preview", manage, validateBody(pricingPreviewSchema), asyncHandler(async (req, res) => void res.json({ breakdown: await preview.preview(req.body) })));

  router.get("/rates/current", view, asyncHandler(async (req, res) => {
    const q = rateQuerySchema.parse(req.query);
    res.json({ rate: await findCurrentRate(q.metalId, q.purity) });
  }));
  router.get("/rates", view, asyncHandler(async (req, res) => {
    const q = rateQuerySchema.parse(req.query);
    res.json({ items: await listRateHistory(q.metalId, q.purity) });
  }));
  // `createdBy` is never taken from the request body — it's always the authenticated actor, the same
  // discipline every other "who did this" field in the system follows.
  router.post("/rates", manage, validateBody(createMetalRateSchema.omit({ createdBy: true })), asyncHandler(async (req, res) => {
    const rate = await createMetalRate({ ...req.body, createdBy: req.auth!.userId });
    res.status(201).json({ rate });
  }));

  return router;
}
