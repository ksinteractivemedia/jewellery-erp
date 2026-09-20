import { Router, type RequestHandler } from "express";
import { PERMISSIONS } from "@jewellery/types";
import { zId } from "@jewellery/validation";
import type { TaxonomyService } from "../../modules/catalog/taxonomy.service";
import { asyncHandler } from "../middleware/async-handler";
import { requirePermission } from "../middleware/authorize";

const { CATALOG_VIEW, CATALOG_MANAGE } = PERMISSIONS;

/** Categories (structure/tree) and collections (curated groupings) share this file: same shape, same permissions. */
export function createTaxonomyRouter(deps: { authenticate: RequestHandler; taxonomy: TaxonomyService }) {
  const { taxonomy } = deps;
  const router = Router();
  router.use(deps.authenticate);

  router.get("/categories", requirePermission(CATALOG_VIEW), asyncHandler(async (_req, res) => {
    res.json({ categories: await taxonomy.listCategories() });
  }));
  router.post("/categories", requirePermission(CATALOG_MANAGE), asyncHandler(async (req, res) => {
    res.status(201).json({ category: await taxonomy.createCategory(req.auth!, req.body, req.ctx) });
  }));
  router.patch("/categories/:id", requirePermission(CATALOG_MANAGE), asyncHandler(async (req, res) => {
    res.json({ category: await taxonomy.updateCategory(req.auth!, zId.parse(req.params.id), req.body, req.ctx) });
  }));
  router.delete("/categories/:id", requirePermission(CATALOG_MANAGE), asyncHandler(async (req, res) => {
    await taxonomy.deleteCategory(req.auth!, zId.parse(req.params.id), req.ctx);
    res.status(204).end();
  }));

  router.get("/collections", requirePermission(CATALOG_VIEW), asyncHandler(async (_req, res) => {
    res.json({ collections: await taxonomy.listCollections() });
  }));
  router.post("/collections", requirePermission(CATALOG_MANAGE), asyncHandler(async (req, res) => {
    res.status(201).json({ collection: await taxonomy.createCollection(req.auth!, req.body, req.ctx) });
  }));
  router.patch("/collections/:id", requirePermission(CATALOG_MANAGE), asyncHandler(async (req, res) => {
    res.json({ collection: await taxonomy.updateCollection(req.auth!, zId.parse(req.params.id), req.body, req.ctx) });
  }));
  router.delete("/collections/:id", requirePermission(CATALOG_MANAGE), asyncHandler(async (req, res) => {
    res.json(await taxonomy.deleteCollection(req.auth!, zId.parse(req.params.id), req.ctx));
  }));

  return router;
}
