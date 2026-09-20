import { Router, type RequestHandler } from "express";
import { PERMISSIONS } from "@jewellery/types";
import { bulkProductActionSchema, productListQuerySchema, zId } from "@jewellery/validation";
import type { ProductService } from "../../modules/catalog/product.service";
import type { VariantService } from "../../modules/catalog/variant.service";
import { asyncHandler } from "../middleware/async-handler";
import { requirePermission } from "../middleware/authorize";

const { CATALOG_VIEW, CATALOG_MANAGE, INVENTORY_VIEW } = PERMISSIONS;

export function createProductsRouter(deps: { authenticate: RequestHandler; products: ProductService; variants: VariantService }) {
  const { products, variants } = deps;
  const router = Router();
  router.use(deps.authenticate);

  // Static paths first, so "meta"/"bulk" are never captured by "/:id".
  router.get("/meta", requirePermission(CATALOG_VIEW), asyncHandler(async (_req, res) => {
    res.json(await products.meta());
  }));

  router.post("/bulk", requirePermission(CATALOG_MANAGE), asyncHandler(async (req, res) => {
    res.json(await products.bulk(req.auth!, bulkProductActionSchema.parse(req.body), req.ctx));
  }));

  router.get("/", requirePermission(CATALOG_VIEW), asyncHandler(async (req, res) => {
    res.json(await products.list(productListQuerySchema.parse(req.query)));
  }));

  router.post("/", requirePermission(CATALOG_MANAGE), asyncHandler(async (req, res) => {
    res.status(201).json({ product: await products.create(req.auth!, req.body, req.ctx) });
  }));

  router.get("/:id", requirePermission(CATALOG_VIEW), asyncHandler(async (req, res) => {
    // Stock is a different domain (InventoryItem) with its own permission: the catalogue reader doesn't get it for free.
    const includeStock = req.auth!.permissions.has(INVENTORY_VIEW);
    res.json({ product: await products.detail(zId.parse(req.params.id), { includeStock }) });
  }));

  router.patch("/:id", requirePermission(CATALOG_MANAGE), asyncHandler(async (req, res) => {
    res.json({ product: await products.update(req.auth!, zId.parse(req.params.id), req.body, req.ctx) });
  }));

  router.delete("/:id", requirePermission(CATALOG_MANAGE), asyncHandler(async (req, res) => {
    await products.remove(req.auth!, zId.parse(req.params.id), req.ctx);
    res.status(204).end();
  }));

  // ---- variants (scoped to their product) --------------------------------
  router.get("/:id/variants", requirePermission(CATALOG_VIEW), asyncHandler(async (req, res) => {
    res.json({ variants: await variants.list(zId.parse(req.params.id)) });
  }));

  router.post("/:id/variants", requirePermission(CATALOG_MANAGE), asyncHandler(async (req, res) => {
    res.status(201).json({ variant: await variants.create(req.auth!, zId.parse(req.params.id), req.body, req.ctx) });
  }));

  router.patch("/:id/variants/:variantId", requirePermission(CATALOG_MANAGE), asyncHandler(async (req, res) => {
    res.json({ variant: await variants.update(req.auth!, zId.parse(req.params.id), zId.parse(req.params.variantId), req.body, req.ctx) });
  }));

  router.delete("/:id/variants/:variantId", requirePermission(CATALOG_MANAGE), asyncHandler(async (req, res) => {
    await variants.remove(req.auth!, zId.parse(req.params.id), zId.parse(req.params.variantId), req.ctx);
    res.status(204).end();
  }));

  return router;
}
