import { Router, type RequestHandler } from "express";
import { cancelOrderSchema, checkoutVerifySchema, initiatePaymentSchema, placeOrderSchema, requestReturnByOrderLinesSchema, verifyPaymentSchema } from "@jewellery/validation";
import type { OrdersModule } from "../../modules/orders";
import { SYSTEM_ACTOR_ID } from "../../modules/inventory";
import { requestReturnForOrderLines } from "../../modules/returns/return.service";
import { listReturnsForOrder } from "../../modules/returns/returns-reads.service";
import { asyncHandler } from "../middleware/async-handler";
import { validateBody } from "../middleware/validate";
import "../context";

const TOKEN_HEADER = "x-order-token";

/**
 * The PUBLIC checkout API. Shoppers are guests: what proves an order is theirs is the access token returned when they placed it
 * (sent back as `X-Order-Token`); a wrong token is indistinguishable from an order that doesn't exist. Nothing here accepts a
 * price, a discount or a stock level from the browser — the schemas are strict, so a body that tries is refused outright.
 * Payment-provider webhooks live here too: they carry no token but a signature, checked by the provider's adapter.
 */
export function createCheckoutRouter(deps: { orders: OrdersModule; writeLimiter: RequestHandler; optionalAuthenticate: RequestHandler }) {
  const { checkout, payments, orders } = deps.orders;
  const router = Router();
  const never: RequestHandler = (_req, res, next) => (res.set("Cache-Control", "no-store"), next());
  const orderOf = (req: Parameters<RequestHandler>[0]) => orders.access(String(req.params.orderNo), req.get(TOKEN_HEADER));

  router.post("/checkout/verify", never, deps.writeLimiter, validateBody(checkoutVerifySchema), asyncHandler(async (req, res) => void res.json(await checkout.verify(req.body))));

  router.post("/checkout/orders", never, deps.writeLimiter, deps.optionalAuthenticate, validateBody(placeOrderSchema), asyncHandler(async (req, res) => {
    // A signed-in B2C customer's order is linked to their account; everyone else checks out as a guest.
    const userId = req.auth?.userType === "B2C_CUSTOMER" ? req.auth.userId : undefined;
    const placed = await checkout.place(req.body, userId ? { userId } : {});
    res.status(placed.replayed ? 200 : 201).json({ order: placed.order, accessToken: placed.accessToken });
  }));

  router.get("/orders/:orderNo", never, asyncHandler(async (req, res) => void res.json({ order: await orders.get(String(req.params.orderNo), req.get(TOKEN_HEADER)) })));

  router.post("/orders/:orderNo/payments", never, deps.writeLimiter, validateBody(initiatePaymentSchema), asyncHandler(async (req, res) => {
    const order = await orderOf(req);
    res.status(201).json({ payment: await payments.initiate(order, req.body.returnPath) });
  }));
  router.post("/orders/:orderNo/payments/:paymentId/verify", never, deps.writeLimiter, validateBody(verifyPaymentSchema), asyncHandler(async (req, res) => {
    res.json({ order: await payments.verifyReturn(await orderOf(req), String(req.params.paymentId), req.body.payload) });
  }));
  router.post("/orders/:orderNo/payments/:paymentId/cancel", never, deps.writeLimiter, asyncHandler(async (req, res) => {
    res.json({ order: await payments.cancelPayment(await orderOf(req), String(req.params.paymentId)) });
  }));
  router.post("/orders/:orderNo/cancel", never, deps.writeLimiter, validateBody(cancelOrderSchema), asyncHandler(async (req, res) => {
    res.json({ order: await orders.cancel(await orderOf(req), req.body.reason) });
  }));

  // Returns — a signed-in-as-guest shopper may request one against their own order; approval, receiving,
  // inspection and settlement stay staff-only (the ERP's Returns screen). The order id is never taken from
  // the request body — it comes from the token-checked order the URL names.
  router.get("/orders/:orderNo/returns", never, asyncHandler(async (req, res) => {
    const order = await orderOf(req);
    res.json({ items: await listReturnsForOrder(order.id) });
  }));
  router.post("/orders/:orderNo/returns", never, deps.writeLimiter, validateBody(requestReturnByOrderLinesSchema), asyncHandler(async (req, res) => {
    const order = await orderOf(req);
    const returned = await requestReturnForOrderLines({ id: SYSTEM_ACTOR_ID, name: order.customer.fullName }, "B2C", order.id, req.body);
    res.status(201).json({ return: returned });
  }));

  router.post("/payments/webhooks/:provider", never, asyncHandler(async (req, res) => {
    const headers = Object.fromEntries(Object.entries(req.headers).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
    const result = await payments.handleWebhook(String(req.params.provider), req.rawBody ?? "", headers);
    // 2xx tells the provider "received, stop retrying". An event about a payment we can't find yet is NOT that: have it sent again.
    res.status(result.status === "unknown_payment" ? 409 : 200).json(result);
  }));

  return router;
}
