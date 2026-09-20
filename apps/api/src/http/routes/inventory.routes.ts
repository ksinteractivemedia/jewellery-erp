import { Router, type RequestHandler } from "express";
import { PERMISSIONS } from "@jewellery/types";
import {
  adjustmentListQuerySchema,
  inventoryListQuerySchema,
  ledgerQuerySchema,
  scanQuerySchema,
  stockSummaryQuerySchema,
  transferListQuerySchema,
  zId,
} from "@jewellery/validation";
import type { InventoryQueryService } from "../../modules/inventory/inventory-query.service";
import type { InventoryService } from "../../modules/inventory/inventory.service";
import { asyncHandler } from "../middleware/async-handler";
import { requireAnyPermission, requirePermission } from "../middleware/authorize";

const { INVENTORY_VIEW, INVENTORY_CREATE, INVENTORY_TRANSFER, INVENTORY_ADJUST, INVENTORY_APPROVE_ADJUSTMENT, SALES_CREATE } = PERMISSIONS;

/**
 * Inventory HTTP surface. Reads need `inventory.view`. Every write names the permission for what it
 * does — receiving stock, moving custody, correcting records, approving corrections — and each is
 * audited by the service. Sale and return are deliberately NOT here: they happen as a consequence of an
 * order/invoice, which will call `sellItems` / `returnItems` in-process (they are stock operations, not
 * something an operator should be able to trigger with a bare id).
 */
export function createInventoryRouter(deps: { authenticate: RequestHandler; queries: InventoryQueryService; inventory: InventoryService }) {
  const { queries, inventory } = deps;
  const router = Router();
  router.use(deps.authenticate);
  const view = requirePermission(INVENTORY_VIEW);

  // ---- reads --------------------------------------------------------------------------------
  router.get("/meta", view, asyncHandler(async (_req, res) => void res.json(await queries.meta())));
  router.get("/locations", view, asyncHandler(async (_req, res) => void res.json({ locations: await queries.locations() })));
  router.get("/items", view, asyncHandler(async (req, res) => void res.json(await queries.list(inventoryListQuerySchema.parse(req.query)))));
  router.get("/stock/summary", view, asyncHandler(async (req, res) => void res.json(await queries.summary(stockSummaryQuerySchema.parse(req.query)))));
  router.get("/ledger", view, asyncHandler(async (req, res) => void res.json(await queries.ledger(ledgerQuerySchema.parse(req.query)))));
  router.get("/scan", view, asyncHandler(async (req, res) => void res.json(await queries.resolveScan(scanQuerySchema.parse(req.query).code))));
  router.get("/items/:id", view, asyncHandler(async (req, res) => void res.json({ item: await queries.detail(zId.parse(req.params.id)) })));
  router.get("/items/:id/audit", view, asyncHandler(async (req, res) => void res.json({ entries: await queries.itemAudit(zId.parse(req.params.id)) })));
  router.get("/transfers", view, asyncHandler(async (req, res) => void res.json(await queries.listTransfers(transferListQuerySchema.parse(req.query)))));
  router.get("/transfers/:id", view, asyncHandler(async (req, res) => void res.json({ transfer: await queries.getTransfer(zId.parse(req.params.id)) })));
  router.get("/adjustments", view, asyncHandler(async (req, res) => void res.json(await queries.listAdjustments(adjustmentListQuerySchema.parse(req.query)))));

  // ---- receiving stock & identifiers ---------------------------------------------------------
  router.post("/items", requirePermission(INVENTORY_CREATE), asyncHandler(async (req, res) => {
    const { item, entry } = await inventory.receiveItem(req.auth!, req.body, req.ctx);
    res.status(201).json({ item: await queries.detail(item.id), entry });
  }));
  router.patch("/items/:id/identifiers", requirePermission(INVENTORY_CREATE), asyncHandler(async (req, res) => {
    const id = zId.parse(req.params.id);
    await inventory.updateIdentifiers(req.auth!, id, req.body, req.ctx);
    res.json({ item: await queries.detail(id) });
  }));

  // ---- holds for orders ----------------------------------------------------------------------
  const reservers = requireAnyPermission(SALES_CREATE, INVENTORY_TRANSFER);
  router.post("/reservations", reservers, asyncHandler(async (req, res) => void res.status(201).json(await inventory.reserve(req.auth!, req.body, req.ctx))));
  router.post("/reservations/release", reservers, asyncHandler(async (req, res) => void res.json(await inventory.release(req.auth!, req.body, req.ctx))));

  // ---- custody: partners, returns, transfers -------------------------------------------------
  const mover = requirePermission(INVENTORY_TRANSFER);
  router.post("/movements", mover, asyncHandler(async (req, res) => void res.status(201).json(await inventory.movePartner(req.auth!, req.body, req.ctx))));
  router.post("/returns/inspect", mover, asyncHandler(async (req, res) => void res.status(201).json(await inventory.inspectReturn(req.auth!, req.body, req.ctx))));
  router.post("/transfers", mover, asyncHandler(async (req, res) => void res.status(201).json({ transfer: await inventory.createTransfer(req.auth!, req.body, req.ctx) })));
  router.post("/transfers/:id/receive", mover, asyncHandler(async (req, res) => void res.json({ transfer: await inventory.receiveTransfer(req.auth!, zId.parse(req.params.id), req.body, req.ctx) })));
  router.post("/transfers/:id/cancel", mover, asyncHandler(async (req, res) => void res.json({ transfer: await inventory.cancelTransfer(req.auth!, zId.parse(req.params.id), req.body, req.ctx) })));

  // ---- corrections (request → someone else approves) -----------------------------------------
  router.post("/adjustments", requirePermission(INVENTORY_ADJUST), asyncHandler(async (req, res) => void res.status(201).json({ adjustment: await inventory.requestAdjustment(req.auth!, req.body, req.ctx) })));
  router.post("/adjustments/:id/approve", requirePermission(INVENTORY_APPROVE_ADJUSTMENT), asyncHandler(async (req, res) => void res.json({ adjustment: await inventory.approveAdjustment(req.auth!, zId.parse(req.params.id), req.body, req.ctx) })));
  router.post("/adjustments/:id/reject", requirePermission(INVENTORY_APPROVE_ADJUSTMENT), asyncHandler(async (req, res) => void res.json({ adjustment: await inventory.rejectAdjustment(req.auth!, zId.parse(req.params.id), req.body, req.ctx) })));

  return router;
}
