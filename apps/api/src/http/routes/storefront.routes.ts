import { Router, type RequestHandler } from "express";
import { newsletterSchema, storeCartQuoteSchema, storeListQuerySchema, zSlug } from "@jewellery/validation";
import type { StorefrontService } from "../../modules/storefront/storefront.service";
import { asyncHandler } from "../middleware/async-handler";
import { validateBody } from "../middleware/validate";

/**
 * The PUBLIC storefront API. No authentication — shoppers are anonymous — so the surface is deliberately narrow:
 * read-only catalogue data shaped for customers (never cost, margin, stock counts beyond "a few left", rule ids or
 * other channels' products), a cart quote that reads and writes nothing, and a newsletter sign-up. Catalogue reads may be
 * cached briefly; because prices move with the metal rate the cache is short, and quotes are never cached.
 */
export function createStorefrontRouter(deps: { storefront: StorefrontService; writeLimiter: RequestHandler }) {
  const { storefront } = deps;
  const router = Router();
  const brief: RequestHandler = (_req, res, next) => (res.set("Cache-Control", "public, max-age=15, stale-while-revalidate=45"), next());
  const never: RequestHandler = (_req, res, next) => (res.set("Cache-Control", "no-store"), next());

  router.get("/content", brief, asyncHandler(async (_req, res) => void res.json(await storefront.content())));
  router.get("/navigation", brief, asyncHandler(async (_req, res) => void res.json(await storefront.navigation())));
  router.get("/home", brief, asyncHandler(async (_req, res) => void res.json(await storefront.home())));
  router.get("/products", brief, asyncHandler(async (req, res) => void res.json(await storefront.list(storeListQuerySchema.parse(req.query)))));
  router.get("/products/:slug", brief, asyncHandler(async (req, res) => void res.json({ product: await storefront.detail(zSlug.parse(req.params.slug)) })));
  router.get("/sitemap", brief, asyncHandler(async (_req, res) => void res.json(await storefront.sitemap())));

  // There is no reviews module yet, so there are no reviews — the API says so rather than returning an empty list that reads like "zero reviews".
  router.get("/reviews", brief, (_req, res) => void res.json({ status: "NOT_CONNECTED", requires: "Reviews module" }));

  router.post("/cart/quote", never, deps.writeLimiter, validateBody(storeCartQuoteSchema), asyncHandler(async (req, res) => void res.json(await storefront.quote(req.body))));
  router.post("/newsletter", never, deps.writeLimiter, validateBody(newsletterSchema), asyncHandler(async (req, res) => {
    await storefront.subscribe(req.body.email);
    res.status(202).json({ status: "received" });
  }));

  return router;
}
