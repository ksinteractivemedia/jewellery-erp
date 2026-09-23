import { Router, type Request, type RequestHandler } from "express";
import multer from "multer";
import { PERMISSIONS } from "@jewellery/types";
import { allocatePaymentSchema, approvePurchaseOrderSchema, convertPurchaseOrderSchema, invoiceOrderSchema, creditApprovalSchema, quoteSchema, recordPaymentSchema, rejectSchema, reversePaymentSchema, updateB2BProfileSchema, verifyB2BPaymentSchema } from "@jewellery/validation";
import type { B2BModule } from "../../modules/b2b";
import type { Actor } from "../../modules/b2b";
import { MAX_ATTACHMENT_BYTES } from "../../modules/b2b/attachments.service";
import { sendAttachment } from "./portal.routes";
import { asyncHandler } from "../middleware/async-handler";
import { requireAnyPermission, requirePermission } from "../middleware/authorize";
import { validateBody } from "../middleware/validate";
import "../context";

const P = PERMISSIONS;

/**
 * The seller's side of wholesale: review purchase orders, quote, approve, allocate stock, invoice, record and verify payments,
 * allocate them to invoices, manage account terms. Every route is behind `authenticate` and a PERMISSION (never a role name); the
 * credit override is its own permission, checked here from the caller's live permissions and enforced again in the service.
 */
export function createB2BAdminRouter(deps: { authenticate: RequestHandler; b2b: B2BModule }) {
  const { reads, procurement, fulfilment, payments, attachments } = deps.b2b;
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_ATTACHMENT_BYTES + 1, files: 1, fields: 0 } });
  const router = Router();
  router.use(deps.authenticate, (_req, res, next) => (res.set("Cache-Control", "no-store"), next()));
  const view = requirePermission(P.B2B_VIEW);
  const money = requireAnyPermission(P.ACCOUNTING_VIEW, P.B2B_VIEW);
  const decide = requirePermission(P.B2B_APPROVE_PO);
  const treasury = requirePermission(P.ACCOUNTING_CREATE_PAYMENT);
  const actor = (req: Express.Request): Actor => ({ id: req.auth!.userId, name: req.auth!.name, ...(req.auth!.email ? { email: req.auth!.email } : {}), kind: "SELLER" });
  const canOverride = (req: Express.Request) => req.auth!.permissions.has(P.B2B_OVERRIDE_CREDIT);
  const param = (req: Request) => String(req.params.id);

  // accounts
  router.get("/customers", view, asyncHandler(async (_req, res) => void res.json({ items: await reads.customers() })));
  router.get("/customers/:id", view, asyncHandler(async (req, res) => void res.json({ account: await reads.account(param(req)) })));
  router.patch("/customers/:id/profile", requirePermission(P.CUSTOMERS_MANAGE), validateBody(updateB2BProfileSchema), asyncHandler(async (req, res) => void res.json({ account: await reads.updateProfile(param(req), actor(req), req.body) })));

  // purchase orders
  router.get("/purchase-orders", view, asyncHandler(async (req, res) => void res.json({ items: await reads.purchaseOrders({ ...(typeof req.query.status === "string" ? { status: req.query.status } : {}), ...(typeof req.query.q === "string" ? { q: req.query.q } : {}), ...(typeof req.query.customerId === "string" ? { customerId: req.query.customerId } : {}) }) })));
  router.get("/purchase-orders/:id", view, asyncHandler(async (req, res) => void res.json({ purchaseOrder: await reads.purchaseOrder(param(req)) })));
  router.post("/purchase-orders/:id/review", decide, asyncHandler(async (req, res) => void res.json({ purchaseOrder: await procurement.startReview(param(req), actor(req)) })));
  router.post("/purchase-orders/:id/approve", decide, validateBody(approvePurchaseOrderSchema), asyncHandler(async (req, res) => void res.json({ purchaseOrder: await procurement.approvePurchaseOrder(param(req), actor(req), req.body.note) })));
  router.post("/purchase-orders/:id/convert", decide, validateBody(convertPurchaseOrderSchema), asyncHandler(async (req, res) => {
    res.status(201).json({ order: await procurement.convertPurchaseOrder(param(req), actor(req), { ...(req.body.creditOverride ? { creditOverride: req.body.creditOverride } : {}), canOverrideCredit: canOverride(req) }) });
  }));
  router.post("/purchase-orders/:id/cancel", decide, validateBody(rejectSchema), asyncHandler(async (req, res) => void res.json({ purchaseOrder: await procurement.cancelPurchaseOrder(await procurement.anyPo(param(req)), actor(req), req.body.reason) })));
  router.post("/purchase-orders/:id/attachments", decide, upload.single("file"), asyncHandler(async (req, res) => {
    if (!req.file) return void res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Choose a file to attach." } });
    res.status(201).json({ attachment: await attachments.add(await procurement.anyPo(param(req)), actor(req), req.file) });
  }));
  router.get("/purchase-orders/:id/attachments/:attId", view, asyncHandler(async (req, res) => sendAttachment(res, await attachments.read(await procurement.anyPo(param(req)), String(req.params.attId)))));
  router.delete("/purchase-orders/:id/attachments/:attId", decide, asyncHandler(async (req, res) => {
    await attachments.remove(await procurement.anyPo(param(req)), String(req.params.attId), actor(req));
    res.status(204).end();
  }));
  router.post("/purchase-orders/:id/quote", decide, validateBody(quoteSchema), asyncHandler(async (req, res) => void res.status(201).json({ quotation: await procurement.issueQuotation(param(req), actor(req), req.body) })));
  router.post("/purchase-orders/:id/reject", decide, validateBody(rejectSchema), asyncHandler(async (req, res) => void res.json({ purchaseOrder: await procurement.rejectPurchaseOrder(param(req), actor(req), req.body.reason) })));

  router.get("/quotations", view, asyncHandler(async (req, res) => void res.json({ items: await reads.quotations({ ...(typeof req.query.status === "string" ? { status: req.query.status } : {}), ...(typeof req.query.customerId === "string" ? { customerId: req.query.customerId } : {}) }) })));
  router.post("/quotations/:id/issue", decide, asyncHandler(async (req, res) => void res.json({ quotation: await procurement.issueDraftQuotation(param(req), actor(req)) })));
  router.post("/quotations/:id/discard", decide, asyncHandler(async (req, res) => void res.json({ quotation: await procurement.discardDraftQuotation(param(req), actor(req)) })));
  router.get("/quotations/:id", view, asyncHandler(async (req, res) => void res.json({ quotation: await reads.quotation(param(req)) })));

  // sales orders
  router.get("/orders", view, asyncHandler(async (req, res) => void res.json({ items: await reads.salesOrders({ ...(typeof req.query.status === "string" ? { status: req.query.status } : {}), ...(typeof req.query.customerId === "string" ? { customerId: req.query.customerId } : {}) }) })));
  router.get("/orders/:id", view, asyncHandler(async (req, res) => void res.json({ order: await reads.salesOrder(param(req)) })));
  router.post("/orders/:id/approve-credit", decide, validateBody(creditApprovalSchema), asyncHandler(async (req, res) => void res.json({ order: await procurement.approveCredit(param(req), actor(req), { reason: req.body.reason, canOverrideCredit: canOverride(req) }) })));
  router.post("/orders/:id/allocate", decide, asyncHandler(async (req, res) => void res.json({ order: await fulfilment.allocate(param(req), actor(req)) })));
  router.post("/orders/:id/release", decide, asyncHandler(async (req, res) => void res.json({ order: await fulfilment.release(param(req), actor(req)) })));
  router.post("/orders/:id/invoice", decide, validateBody(invoiceOrderSchema), asyncHandler(async (req, res) => void res.status(201).json({ invoice: await fulfilment.invoice(param(req), actor(req), req.body.lines) })));
  router.post("/orders/:id/cancel", decide, validateBody(rejectSchema), asyncHandler(async (req, res) => void res.json({ order: await fulfilment.cancel(param(req), actor(req), req.body.reason) })));

  // invoices and payments
  router.get("/invoices", money, asyncHandler(async (req, res) => void res.json({ items: await reads.invoices({ ...(typeof req.query.status === "string" ? { status: req.query.status } : {}), ...(typeof req.query.customerId === "string" ? { customerId: req.query.customerId } : {}) }) })));
  router.get("/invoices/:id", money, asyncHandler(async (req, res) => void res.json({ invoice: await reads.invoice(param(req)) })));
  router.get("/payments", money, asyncHandler(async (req, res) => void res.json({ items: await reads.payments({ ...(typeof req.query.status === "string" ? { status: req.query.status } : {}), ...(typeof req.query.customerId === "string" ? { customerId: req.query.customerId } : {}) }) })));
  router.post("/payments", treasury, validateBody(recordPaymentSchema), asyncHandler(async (req, res) => {
    const { customerId, ...input } = req.body;
    res.status(201).json({ payment: await payments.record(customerId, actor(req), input) });
  }));
  router.post("/payments/:id/verify", treasury, validateBody(verifyB2BPaymentSchema), asyncHandler(async (req, res) => void res.json({ payment: await payments.verify(param(req), actor(req), req.body.note) })));
  router.post("/payments/:id/reject", treasury, validateBody(rejectSchema), asyncHandler(async (req, res) => void res.json({ payment: await payments.reject(param(req), actor(req), req.body.reason) })));
  router.post("/payments/:id/reverse", treasury, validateBody(reversePaymentSchema), asyncHandler(async (req, res) => void res.json({ payment: await payments.reverse(param(req), actor(req), req.body.reason) })));
  router.post("/payments/:id/allocate", treasury, validateBody(allocatePaymentSchema), asyncHandler(async (req, res) => void res.json({ payment: await payments.allocate(param(req), actor(req), req.body.allocations) })));

  return router;
}
