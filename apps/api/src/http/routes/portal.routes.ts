import { Router, type Request, type RequestHandler, type Response } from "express";
import multer from "multer";
import { cancelSchema, cartQuoteSchema, counterOfferSchema, createPurchaseOrderSchema, portalCatalogueQuerySchema, quickOrderResolveSchema, reportPaymentSchema, requestReturnByOrderLinesSchema } from "@jewellery/validation";
import type { B2BModule } from "../../modules/b2b";
import { MAX_ATTACHMENT_BYTES } from "../../modules/b2b/attachments.service";
import { requestReturnForOrderLines } from "../../modules/returns/return.service";
import { listReturnsForOrder } from "../../modules/returns/returns-reads.service";
import { asyncHandler } from "../middleware/async-handler";
import { requireBuyer } from "../middleware/require-buyer";
import { validateBody } from "../middleware/validate";
import "../context";

/**
 * The wholesale portal API. Every route sits behind `authenticate` + `requireBuyer`, and every handler passes the buyer's OWN
 * customer id (from the database) into the service — a request cannot ask for another customer's data because it has nowhere to say so.
 * Bodies are strict: a price, discount or total in a request is refused. The portal shows the credit rule; it never enforces it.
 */
export function createPortalRouter(deps: { authenticate: RequestHandler; b2b: B2BModule; writeLimiter: RequestHandler }) {
  const { reads, procurement, payments, attachments } = deps.b2b;
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_ATTACHMENT_BYTES + 1, files: 1, fields: 0 } });
  const router = Router();
  const never: RequestHandler = (_req, res, next) => (res.set("Cache-Control", "no-store"), next());
  router.use(deps.authenticate, requireBuyer, never);
  const me = (req: Request) => req.buyer!;

  router.get("/account", asyncHandler(async (req, res) => void res.json({ account: await reads.account(me(req).customerId) })));
  router.get("/dashboard", asyncHandler(async (req, res) => void res.json(await reads.dashboard(me(req).customerId))));
  router.get("/outstanding", asyncHandler(async (req, res) => void res.json(await reads.outstanding(me(req).customerId))));
  router.get("/catalogue", asyncHandler(async (req, res) => void res.json(await reads.catalogue(me(req).customerId, portalCatalogueQuerySchema.parse(req.query)))));

  // Quick order and the cart use the same server-side check: SKU + quantity in, priced and validated lines (and the credit position) out.
  router.post("/quick-order/resolve", deps.writeLimiter, validateBody(quickOrderResolveSchema), asyncHandler(async (req, res) => void res.json(await procurement.quoteCart(me(req).customerId, req.body))));
  router.post("/cart/quote", deps.writeLimiter, validateBody(cartQuoteSchema), asyncHandler(async (req, res) => void res.json(await procurement.quoteCart(me(req).customerId, req.body))));

  router.get("/purchase-orders", asyncHandler(async (req, res) => void res.json({ items: await reads.purchaseOrders({ customerId: me(req).customerId }) })));
  router.get("/purchase-orders/:id", asyncHandler(async (req, res) => void res.json({ purchaseOrder: await reads.purchaseOrder(String(req.params.id), { customerId: me(req).customerId }) })));
  router.post("/purchase-orders", deps.writeLimiter, validateBody(createPurchaseOrderSchema), asyncHandler(async (req, res) => {
    res.status(201).json({ purchaseOrder: await procurement.createPurchaseOrder(me(req).customerId, me(req).actor, req.body) });
  }));
  router.put("/purchase-orders/:id", deps.writeLimiter, validateBody(createPurchaseOrderSchema), asyncHandler(async (req, res) => {
    res.json({ purchaseOrder: await procurement.updateDraft(me(req).customerId, String(req.params.id), me(req).actor, req.body) });
  }));
  router.post("/purchase-orders/:id/submit", deps.writeLimiter, asyncHandler(async (req, res) => void res.json({ purchaseOrder: await procurement.submitPurchaseOrder(me(req).customerId, String(req.params.id), me(req).actor) })));
  router.post("/purchase-orders/:id/cancel", deps.writeLimiter, validateBody(cancelSchema), asyncHandler(async (req, res) => {
    res.json({ purchaseOrder: await procurement.cancelOwnPurchaseOrder(me(req).customerId, String(req.params.id), me(req).actor, req.body.reason) });
  }));

  // Files attached to a purchase order: private, checked by content, downloaded only through this authorised route.
  router.post("/purchase-orders/:id/attachments", deps.writeLimiter, upload.single("file"), asyncHandler(async (req, res) => {
    if (!req.file) return void res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Choose a file to attach." } });
    const po = await procurement.ownPo(me(req).customerId, String(req.params.id));
    res.status(201).json({ attachment: await attachments.add(po, me(req).actor, req.file) });
  }));
  router.get("/purchase-orders/:id/attachments/:attId", asyncHandler(async (req, res) => sendAttachment(res, await attachments.read(await procurement.ownPo(me(req).customerId, String(req.params.id)), String(req.params.attId)))));
  router.delete("/purchase-orders/:id/attachments/:attId", deps.writeLimiter, asyncHandler(async (req, res) => {
    await attachments.remove(await procurement.ownPo(me(req).customerId, String(req.params.id)), String(req.params.attId), me(req).actor);
    res.status(204).end();
  }));

  router.get("/quotations", asyncHandler(async (req, res) => void res.json({ items: await reads.quotations({ customerId: me(req).customerId }) })));
  router.get("/quotations/:id", asyncHandler(async (req, res) => void res.json({ quotation: await reads.quotation(String(req.params.id), { customerId: me(req).customerId }) })));
  router.post("/quotations/:id/accept", deps.writeLimiter, asyncHandler(async (req, res) => void res.json({ purchaseOrder: await procurement.acceptQuotation(me(req).customerId, String(req.params.id), me(req).actor) })));
  router.post("/quotations/:id/counter", deps.writeLimiter, validateBody(counterOfferSchema), asyncHandler(async (req, res) => void res.json({ quotation: await procurement.counterQuotation(me(req).customerId, String(req.params.id), me(req).actor, req.body) })));
  router.post("/quotations/:id/decline", deps.writeLimiter, validateBody(cancelSchema), asyncHandler(async (req, res) => void res.json({ quotation: await procurement.declineQuotation(me(req).customerId, String(req.params.id), me(req).actor, req.body.reason) })));

  router.get("/orders", asyncHandler(async (req, res) => void res.json({ items: await reads.salesOrders({ customerId: me(req).customerId }) })));
  router.get("/orders/:id", asyncHandler(async (req, res) => void res.json({ order: await reads.salesOrder(String(req.params.id), { customerId: me(req).customerId }) })));
  router.get("/invoices", asyncHandler(async (req, res) => void res.json({ items: await reads.invoices({ customerId: me(req).customerId }) })));
  router.get("/invoices/:id", asyncHandler(async (req, res) => void res.json({ invoice: await reads.invoice(String(req.params.id), { customerId: me(req).customerId }) })));

  // Returns — a buyer may request one against their own sales order; approval, receiving, inspection and
  // settlement stay seller-side (the ERP's Returns screen). `reads.salesOrder` is the ownership check: it
  // throws if the order isn't this buyer's, so a request can never name another customer's order.
  router.get("/orders/:id/returns", asyncHandler(async (req, res) => {
    const order = await reads.salesOrder(String(req.params.id), { customerId: me(req).customerId });
    res.json({ items: await listReturnsForOrder(order.id) });
  }));
  router.post("/orders/:id/returns", deps.writeLimiter, validateBody(requestReturnByOrderLinesSchema), asyncHandler(async (req, res) => {
    const order = await reads.salesOrder(String(req.params.id), { customerId: me(req).customerId });
    const returned = await requestReturnForOrderLines(me(req).actor, "B2B", order.id, req.body);
    res.status(201).json({ return: returned });
  }));

  router.get("/payments", asyncHandler(async (req, res) => void res.json({ items: await reads.payments({ customerId: me(req).customerId }) })));
  router.post("/payments", deps.writeLimiter, validateBody(reportPaymentSchema), asyncHandler(async (req, res) => {
    res.status(201).json({ payment: await payments.report(me(req).customerId, me(req).actor, req.body) });
  }));

  return router;
}

/** A download is always an attachment, never rendered by the browser, never cached, never sniffed. */
export function sendAttachment(res: Response, f: { bytes: Buffer; name: string; mimeType: string }) {
  res.set({ "Content-Type": f.mimeType, "Content-Length": String(f.bytes.length), "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(f.name)}`, "X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store" });
  res.send(f.bytes);
}
