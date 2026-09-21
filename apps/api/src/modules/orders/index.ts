import type { AppConfig } from "../../config/app-config";
import type { MediaService } from "../media/media.service";
import { createCheckoutService } from "./checkout.service";
import { createOrderService } from "./order.service";
import { createPaymentService } from "./payment.service";
import { PaymentProviders, type PaymentProvider } from "./payments/payment-provider";

export * from "./order-status";
export * from "./order.model";
export * from "./payment.model";
export * from "./price-snapshot.model";
export * from "./payments/payment-provider";
export { orderAccessToken } from "./order-access";

/** Wires checkout, payments and order handling over one set of payment adapters. Production registers none until a gateway adapter exists. */
export function createOrdersModule(deps: { config: AppConfig; media: MediaService; paymentProviders?: readonly PaymentProvider[]; now?: () => Date }) {
  const providers = new PaymentProviders(deps.paymentProviders);
  const base = { config: deps.config, media: deps.media, ...(deps.now ? { now: deps.now } : {}) };
  const payments = createPaymentService({ ...base, providers });
  return {
    providers,
    checkout: createCheckoutService({ ...base, providers }),
    payments,
    orders: createOrderService({ config: deps.config, payments, ...(deps.now ? { now: deps.now } : {}) }),
  };
}
export type OrdersModule = ReturnType<typeof createOrdersModule>;

/** Runs the expiry sweep on a timer (in-process; move to a BullMQ job with the rest of the queues — architecture.md §8). */
export function startOrderExpirySweep(orders: OrdersModule["orders"], everyMs = 60_000): () => void {
  const timer = setInterval(() => {
    orders.expireStale().catch((error) => console.error("[orders] expiry sweep failed", error));
  }, everyMs);
  timer.unref();
  return () => clearInterval(timer);
}
