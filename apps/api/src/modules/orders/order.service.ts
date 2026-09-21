import type { StoreOrder } from "@jewellery/types";
import type { AppConfig } from "../../config/app-config";
import { ConflictError, NotFoundError } from "../../shared/errors";
import { isValidOrderAccessToken } from "./order-access";
import { releaseHeldPieces, returnSoldPieces } from "./order-inventory";
import { moveOrder } from "./order-store";
import { OrderModel, type OrderDocument } from "./order.model";
import type { PaymentService } from "./payment.service";

const UNPAID = ["PENDING_PAYMENT", "PAYMENT_FAILED"] as const;
const PAID = ["PAID", "CONFIRMED"] as const;

/** Reading, cancelling and expiring orders. Money goes through the payment service; stock through the ledger — never directly. */
export function createOrderService(deps: { config: AppConfig; payments: PaymentService; now?: () => Date }) {
  const { config, payments } = deps;
  const clock = deps.now ?? (() => new Date());

  /**
   * The order, if — and only if — the caller holds its access token. A wrong token is answered exactly like an order that
   * doesn't exist, so order numbers can't be probed.
   */
  async function access(orderNo: string, token: string | undefined): Promise<OrderDocument> {
    const order = await OrderModel.findOne({ orderNo });
    if (!order || !isValidOrderAccessToken(config.auth.accessSecret, order.id, token)) throw new NotFoundError("Order", orderNo);
    return order;
  }

  /** Cancel an order that has not been paid: free the pieces, void any open payment. */
  async function cancelUnpaid(order: OrderDocument, cancelReason: string, note: string): Promise<OrderDocument | null> {
    const cancelled = await moveOrder(order._id, "CANCELLED", [...UNPAID, "DRAFT"], { at: clock(), reason: note, set: { cancelledAt: clock(), cancelReason }, unset: ["holdExpiresAt"] });
    if (!cancelled) return null;
    await payments.voidOpenPayments(cancelled._id, "ORDER_CANCELLED");
    await releaseHeldPieces(cancelled, note);
    return cancelled;
  }

  return {
    access,

    async get(orderNo: string, token: string | undefined): Promise<StoreOrder> {
      return payments.view(await access(orderNo, token));
    },

    /**
     * The customer cancels. Before payment that simply frees the pieces. After payment the pieces come back (to be inspected before
     * resale) and the money is refunded in full. Once the parcel is packed it is a return, not a cancellation.
     */
    async cancel(order: OrderDocument, reason?: string): Promise<StoreOrder> {
      let current = order;
      if ((UNPAID as readonly string[]).includes(current.status)) {
        // Someone may be paying this very second: ask the provider before deciding.
        await payments.reconcileOpenPayments(current._id);
        current = (await OrderModel.findById(current._id)) ?? current;
        if ((UNPAID as readonly string[]).includes(current.status)) {
          const done = await cancelUnpaid(current, "CUSTOMER_CANCELLED", reason ? `Cancelled by the customer: ${reason}` : "Cancelled by the customer");
          if (!done) throw new ConflictError("the order changed while it was being cancelled — please look again");
          return payments.view(done);
        }
      }
      if (!(PAID as readonly string[]).includes(current.status)) throw new ConflictError(`this order is ${current.status.replace("_", " ").toLowerCase()} and can no longer be cancelled`);

      const cancelled = await moveOrder(current._id, "CANCELLED", [...PAID], { at: clock(), reason: reason ? `Cancelled by the customer: ${reason}` : "Cancelled by the customer", set: { cancelledAt: clock(), cancelReason: "CUSTOMER_CANCELLED" } });
      if (!cancelled) throw new ConflictError("the order changed while it was being cancelled — please look again");
      await returnSoldPieces(cancelled, "Order cancelled by the customer");
      if (cancelled.paymentId) {
        try {
          await payments.refund(String(cancelled.paymentId), { reason: "ORDER_CANCELLED" });
        } catch (error) {
          // The order IS cancelled; the refund is recorded as failed on the payment for a retry. The customer is told it is on its way, not that it is done.
          console.error(`[orders] refund for ${cancelled.orderNo} failed`, error);
        }
      }
      return payments.view(cancelled);
    },

    /**
     * Holds that ran out: orders nobody paid for are cancelled and their pieces go back on sale. Before cancelling, each is checked with
     * the provider — a customer who paid in the last second must not lose the order. Idempotent; safe to run on a schedule.
     */
    async expireStale(now: Date = clock()): Promise<{ cancelled: number; paidMeanwhile: number }> {
      const stale = await OrderModel.find({ status: { $in: ["DRAFT", ...UNPAID] }, holdExpiresAt: { $lte: now } }).limit(200);
      let cancelled = 0;
      let paidMeanwhile = 0;
      for (const order of stale) {
        await payments.reconcileOpenPayments(order._id);
        const fresh = await OrderModel.findById(order._id);
        if (!fresh || !(["DRAFT", ...UNPAID] as string[]).includes(fresh.status)) {
          paidMeanwhile++;
          continue;
        }
        if (await cancelUnpaid(fresh, "HOLD_EXPIRED", "The hold on the pieces ran out before payment")) cancelled++;
      }
      return { cancelled, paidMeanwhile };
    },
  };
}
export type OrderService = ReturnType<typeof createOrderService>;
