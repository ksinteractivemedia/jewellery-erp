import { Router, type RequestHandler } from "express";
import { PERMISSIONS } from "@jewellery/types";
import { pricingPreviewSchema } from "@jewellery/validation";
import type { PricingPreviewService } from "../../modules/pricing/pricing-preview.service";
import { asyncHandler } from "../middleware/async-handler";
import { requirePermission } from "../middleware/authorize";
import { validateBody } from "../middleware/validate";

/**
 * Internal pricing playground. `pricing.manage` (not `pricing.view`): the breakdown can include cost and
 * margin, which are not for every staff role — and this is a tool for whoever maintains pricing rules.
 * There is deliberately no route that prices a real order or stores a PriceSnapshot yet.
 */
export function createPricingRouter(deps: { authenticate: RequestHandler; preview: PricingPreviewService }) {
  const { preview } = deps;
  const router = Router();
  router.use(deps.authenticate);
  const manage = requirePermission(PERMISSIONS.PRICING_MANAGE);

  router.get("/meta", manage, asyncHandler(async (_req, res) => void res.json(await preview.meta())));
  router.post("/preview", manage, validateBody(pricingPreviewSchema), asyncHandler(async (req, res) => void res.json({ breakdown: await preview.preview(req.body) })));

  return router;
}
