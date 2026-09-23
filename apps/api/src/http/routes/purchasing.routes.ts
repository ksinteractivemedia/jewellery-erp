import { Router, type Request, type RequestHandler } from "express";
import { PERMISSIONS } from "@jewellery/types";
import {
  allocateSupplierPaymentSchema,
  approveSupplierPurchaseOrderSchema,
  cancelSupplierPurchaseOrderSchema,
  cancelSupplierInvoiceSchema,
  createSupplierPurchaseOrderSchema,
  createRequisitionSchema,
  createSupplierInvoiceSchema,
  createSupplierSchema,
  receiveGoodsSchema,
  recordSupplierPaymentSchema,
  rejectRequisitionSchema,
  reverseSupplierPaymentSchema,
  updateSupplierSchema,
} from "@jewellery/validation";
import * as goodsReceipts from "../../modules/procurement/goods-receipt.service";
import * as reads from "../../modules/procurement/procurement-reads.service";
import type { Actor } from "../../modules/procurement/procurement-store";
import * as requisitions from "../../modules/procurement/requisition.service";
import * as purchaseOrders from "../../modules/procurement/purchase-order.service";
import * as supplierInvoices from "../../modules/procurement/supplier-invoice.service";
import * as supplierPayments from "../../modules/procurement/supplier-payment.service";
import { createSupplier, findSupplierById, listSuppliers, updateSupplier } from "../../modules/suppliers/supplier.repository";
import { NotFoundError } from "../../shared/errors";
import { asyncHandler } from "../middleware/async-handler";
import { requireAnyPermission, requirePermission } from "../middleware/authorize";
import { validateBody } from "../middleware/validate";
import "../context";

const P = PERMISSIONS;

/**
 * Purchasing: requisitions → purchase orders → goods receipts (which post real inventory ledger
 * entries) → supplier invoices → supplier payments. Every route sits behind `authenticate` and a
 * PERMISSION, never a role name; every state change goes through the module's named actions, which
 * refuse anything not in their rule table.
 */
export function createPurchasingRouter(deps: { authenticate: RequestHandler }) {
  const router = Router();
  router.use(deps.authenticate, (_req, res, next) => (res.set("Cache-Control", "no-store"), next()));
  const view = requirePermission(P.PURCHASING_VIEW);
  const create = requirePermission(P.PURCHASING_CREATE);
  const approve = requirePermission(P.PURCHASING_APPROVE);
  const receive = requirePermission(P.PURCHASING_RECEIVE);
  const cancel = requirePermission(P.PURCHASING_CANCEL);
  const money = requireAnyPermission(P.ACCOUNTING_VIEW, P.PURCHASING_VIEW);
  const treasury = requirePermission(P.ACCOUNTING_CREATE_PAYMENT);
  const actor = (req: Express.Request): Actor => ({ id: req.auth!.userId, name: req.auth!.name, ...(req.auth!.email ? { email: req.auth!.email } : {}) });
  const param = (req: Request) => String(req.params.id);

  // dashboard
  router.get("/dashboard", view, asyncHandler(async (_req, res) => void res.json(await reads.purchaseDashboard())));

  // suppliers
  router.get("/suppliers", view, asyncHandler(async (_req, res) => void res.json({ items: await reads.listSuppliersWithPosition() })));
  router.get("/suppliers/:id", view, asyncHandler(async (req, res) => {
    const supplier = await findSupplierById(param(req));
    if (!supplier) throw new NotFoundError("Supplier", param(req));
    void res.json({ supplier });
  }));
  router.get("/suppliers/:id/outstanding", money, asyncHandler(async (req, res) => void res.json({ outstanding: await reads.getSupplierOutstanding(param(req)) })));
  router.post("/suppliers", create, validateBody(createSupplierSchema), asyncHandler(async (req, res) => void res.status(201).json({ supplier: await createSupplier(req.body) })));
  router.patch("/suppliers/:id", create, validateBody(updateSupplierSchema), asyncHandler(async (req, res) => void res.json({ supplier: await updateSupplier(param(req), req.body) })));

  // purchase requisitions
  router.get("/requisitions", view, asyncHandler(async (req, res) => void res.json({ items: await requisitions.listRequisitions({ ...(typeof req.query.status === "string" ? { status: req.query.status } : {}) }) })));
  router.get("/requisitions/:id", view, asyncHandler(async (req, res) => void res.json({ requisition: await requisitions.getRequisition(param(req)) })));
  router.post("/requisitions", create, validateBody(createRequisitionSchema), asyncHandler(async (req, res) => void res.status(201).json({ requisition: await requisitions.createRequisition(actor(req), req.body) })));
  router.put("/requisitions/:id", create, validateBody(createRequisitionSchema), asyncHandler(async (req, res) => void res.json({ requisition: await requisitions.updateDraftRequisition(param(req), actor(req), req.body) })));
  router.post("/requisitions/:id/submit", create, asyncHandler(async (req, res) => void res.json({ requisition: await requisitions.submitRequisition(param(req), actor(req)) })));
  router.post("/requisitions/:id/approve", approve, validateBody(approveSupplierPurchaseOrderSchema), asyncHandler(async (req, res) => void res.json({ requisition: await requisitions.approveRequisition(param(req), actor(req), req.body.note) })));
  router.post("/requisitions/:id/reject", approve, validateBody(rejectRequisitionSchema), asyncHandler(async (req, res) => void res.json({ requisition: await requisitions.rejectRequisition(param(req), actor(req), req.body.reason) })));
  router.post("/requisitions/:id/cancel", create, validateBody(cancelSupplierPurchaseOrderSchema.partial()), asyncHandler(async (req, res) => void res.json({ requisition: await requisitions.cancelRequisition(param(req), actor(req), req.body?.reason) })));

  // purchase orders
  router.get("/purchase-orders", view, asyncHandler(async (req, res) => void res.json({
    items: await purchaseOrders.listPurchaseOrders({
      ...(typeof req.query.status === "string" ? { status: req.query.status } : {}),
      ...(typeof req.query.supplierId === "string" ? { supplierId: req.query.supplierId } : {}),
      ...(typeof req.query.q === "string" ? { q: req.query.q } : {}),
    }),
  })));
  router.get("/purchase-orders/:id", view, asyncHandler(async (req, res) => void res.json({ purchaseOrder: await purchaseOrders.getPurchaseOrder(param(req)) })));
  router.post("/purchase-orders", create, validateBody(createSupplierPurchaseOrderSchema), asyncHandler(async (req, res) => void res.status(201).json({ purchaseOrder: await purchaseOrders.createPurchaseOrder(actor(req), req.body) })));
  router.put("/purchase-orders/:id", create, validateBody(createSupplierPurchaseOrderSchema), asyncHandler(async (req, res) => void res.json({ purchaseOrder: await purchaseOrders.updateDraftPurchaseOrder(param(req), actor(req), req.body) })));
  router.post("/purchase-orders/:id/submit", create, asyncHandler(async (req, res) => void res.json({ purchaseOrder: await purchaseOrders.submitPurchaseOrder(param(req), actor(req)) })));
  router.post("/purchase-orders/:id/approve", approve, validateBody(approveSupplierPurchaseOrderSchema), asyncHandler(async (req, res) => void res.json({ purchaseOrder: await purchaseOrders.approvePurchaseOrder(param(req), actor(req), req.body.note) })));
  router.post("/purchase-orders/:id/cancel", cancel, validateBody(cancelSupplierPurchaseOrderSchema.partial()), asyncHandler(async (req, res) => void res.json({ purchaseOrder: await purchaseOrders.cancelPurchaseOrder(param(req), actor(req), req.body?.reason) })));
  router.post("/purchase-orders/:id/receive", receive, validateBody(receiveGoodsSchema), asyncHandler(async (req, res) => void res.status(201).json({ goodsReceipt: await goodsReceipts.receiveGoods(param(req), actor(req), req.body) })));
  router.get("/purchase-orders/:id/goods-receipts", view, asyncHandler(async (req, res) => void res.json({ items: await goodsReceipts.listGoodsReceipts({ purchaseOrderId: param(req) }) })));

  // goods receipts
  router.get("/goods-receipts", view, asyncHandler(async (_req, res) => void res.json({ items: await goodsReceipts.listGoodsReceipts() })));
  router.get("/goods-receipts/:id", view, asyncHandler(async (req, res) => void res.json({ goodsReceipt: await goodsReceipts.getGoodsReceipt(param(req)) })));

  // supplier invoices
  router.get("/supplier-invoices", money, asyncHandler(async (req, res) => void res.json({
    items: await supplierInvoices.listSupplierInvoices({
      ...(typeof req.query.supplierId === "string" ? { supplierId: req.query.supplierId } : {}),
      ...(typeof req.query.purchaseOrderId === "string" ? { purchaseOrderId: req.query.purchaseOrderId } : {}),
    }),
  })));
  router.get("/supplier-invoices/:id", money, asyncHandler(async (req, res) => void res.json({ supplierInvoice: await supplierInvoices.getSupplierInvoice(param(req)) })));
  router.post("/supplier-invoices", treasury, validateBody(createSupplierInvoiceSchema), asyncHandler(async (req, res) => void res.status(201).json({ supplierInvoice: await supplierInvoices.createSupplierInvoice(actor(req), req.body) })));
  router.post("/supplier-invoices/:id/cancel", treasury, validateBody(cancelSupplierInvoiceSchema), asyncHandler(async (req, res) => void res.json({ supplierInvoice: await supplierInvoices.cancelSupplierInvoice(param(req), actor(req), req.body.reason) })));

  // supplier payments
  router.get("/supplier-payments", money, asyncHandler(async (req, res) => void res.json({ items: await supplierPayments.listSupplierPayments({ ...(typeof req.query.supplierId === "string" ? { supplierId: req.query.supplierId } : {}) }) })));
  router.get("/supplier-payments/:id", money, asyncHandler(async (req, res) => void res.json({ supplierPayment: await supplierPayments.getSupplierPayment(param(req)) })));
  router.post("/supplier-payments", treasury, validateBody(recordSupplierPaymentSchema), asyncHandler(async (req, res) => void res.status(201).json({ supplierPayment: await supplierPayments.recordSupplierPayment(actor(req), req.body) })));
  router.post("/supplier-payments/:id/allocate", treasury, validateBody(allocateSupplierPaymentSchema), asyncHandler(async (req, res) => void res.json({ supplierPayment: await supplierPayments.allocateSupplierPayment(param(req), actor(req), req.body.allocations) })));
  router.post("/supplier-payments/:id/reverse", treasury, validateBody(reverseSupplierPaymentSchema), asyncHandler(async (req, res) => void res.json({ supplierPayment: await supplierPayments.reverseSupplierPayment(param(req), actor(req), req.body.reason) })));

  return router;
}
