import { Types } from "mongoose";
import type { Paise, StoreOrder, StorePaymentStart } from "@jewellery/types";
import type { AppConfig } from "../../config/app-config";
import { AppError, ConflictError, NotFoundError } from "../../shared/errors";
import { withInventoryTransaction } from "../inventory/inventory-transaction.service";
import type { MediaService } from "../media/media.service";
import { HoldExpiredError } from "./checkout.errors";
import { isStockConflict, releaseHeldPieces, sellPieces } from "./order-inventory";
import { moveOrder } from "./order-store";
import { canAdvancePayment, paymentStatusFor, type ReportedPaymentStatus } from "./order-status";
import { toStoreOrder } from "./order-view";
import { OrderModel, type OrderDocument } from "./order.model";
import { PaymentEventModel, PaymentModel, type PaymentDocument } from "./payment.model";
import { PaymentProviderError, WebhookRejectedError, type PaymentProviders, type ProviderEvent, type ProviderPaymentState } from "./payments/payment-provider";

export type Outcome = "APPLIED" | "IGNORED";

/** The order could not accept this payment (it was cancelled, or paid by another attempt) — the money must go back. */
class NotPayableError extends AppError {
  constructor() {
    super("The order is no longer waiting for payment", "ORDER_NOT_PAYABLE");
  }
}

const OPEN = ["PENDING", "AUTHORIZED"] as const;
const CAPTURABLE = ["PENDING", "AUTHORIZED", "FAILED"] as const;

/**
 * Payments, provider-independent. Everything that can happen to money on an order goes through here, and everything a
 * provider says — whether the customer's browser came back, a webhook arrived, or a sweep asked — is folded in by ONE
 * function (`apply`), which is idempotent and never moves a payment backwards. So a duplicated webhook, a webhook racing the
 * customer's return and a webhook arriving out of order all converge on the same result.
 */
export function createPaymentService(deps: { config: AppConfig; providers: PaymentProviders; media: MediaService; now?: () => Date }) {
  const { config, providers, media } = deps;
  const clock = deps.now ?? (() => new Date());

  const view = async (order: OrderDocument): Promise<StoreOrder> => {
    const fresh = (await OrderModel.findById(order._id)) ?? order;
    const payment = await PaymentModel.findOne({ orderId: fresh._id }).sort({ attempt: -1 });
    return toStoreOrder(fresh, payment ? { id: payment.id, status: payment.status, amount: payment.amount, refundedAmount: payment.refundedAmount, failureReason: payment.failureReason } : null, media, clock());
  };

  // ---- refunds ---------------------------------------------------------------------------------

  /** Once a payment is fully refunded, an order that was cancelled after being paid is REFUNDED. */
  async function afterRefund(payment: PaymentDocument) {
    if (payment.status === "REFUNDED") await moveOrder(payment.orderId, "REFUNDED", ["CANCELLED", "RETURNED"], { reason: "Refund completed", at: clock() });
  }

  async function settleRefund(paymentId: Types.ObjectId, match: Record<string, unknown>, outcome: { status: "SUCCEEDED" | "FAILED"; providerRefundRef?: string; failureReason?: string }): Promise<PaymentDocument | null> {
    const refund = outcome.status === "SUCCEEDED";
    const updated = await PaymentModel.findOneAndUpdate(
      { _id: paymentId, refunds: { $elemMatch: { ...match, status: "PENDING" } } },
      { $set: { "refunds.$.status": outcome.status, ...(outcome.providerRefundRef ? { "refunds.$.providerRefundRef": outcome.providerRefundRef } : {}), ...(outcome.failureReason ? { "refunds.$.failureReason": outcome.failureReason } : {}) } },
      { new: true }
    );
    if (!updated) return null; // already settled: a redelivered event
    // Recompute what has really gone back from the refunds themselves, so the figure can never drift from the list.
    const returned = updated.refunds.filter((r) => r.status === "SUCCEEDED").reduce((sum, r) => sum + r.amount, 0);
    const status = paymentStatusFor({ status: updated.status, capturedAmount: updated.capturedAmount, refundedAmount: returned });
    const final = await PaymentModel.findOneAndUpdate({ _id: paymentId }, { $set: { refundedAmount: returned, status } }, { new: true });
    if (final && refund) await afterRefund(final);
    return final;
  }

  /**
   * Give money back — the whole of what is left by default. The amount is reserved against the payment BEFORE the provider is
   * asked (a guard on the pending + succeeded total), so two refunds racing can never return more than was taken.
   */
  async function refund(paymentId: string, opts: { amount?: Paise; reason: string }): Promise<{ status: "SUCCEEDED" | "PENDING" | "FAILED"; amount: Paise }> {
    const payment = await PaymentModel.findById(paymentId);
    if (!payment) throw new NotFoundError("Payment", paymentId);
    const committed = payment.refunds.filter((r) => r.status !== "FAILED").reduce((s, r) => s + r.amount, 0);
    const amount = opts.amount ?? payment.capturedAmount - committed;
    if (amount <= 0) throw new ConflictError("there is nothing left to refund on this payment");

    const refundId = new Types.ObjectId();
    const key = `refund:${paymentId}:${refundId.toHexString()}`;
    const reserved = await PaymentModel.findOneAndUpdate(
      {
        _id: payment._id,
        status: { $in: ["CAPTURED", "PARTIALLY_REFUNDED"] },
        $expr: { $lte: [{ $add: [{ $sum: { $map: { input: { $filter: { input: "$refunds", cond: { $in: ["$$this.status", ["PENDING", "SUCCEEDED"]] } } }, in: "$$this.amount" } } }, amount] }, "$capturedAmount"] },
      },
      { $push: { refunds: { _id: refundId, amount, status: "PENDING", reason: opts.reason, idempotencyKey: key, createdAt: clock() } } },
      { new: true }
    );
    if (!reserved) throw new ConflictError("that amount is more than can still be refunded");

    const provider = providers.get(payment.provider);
    if (!provider || !payment.providerRef) {
      await settleRefund(payment._id, { _id: refundId }, { status: "FAILED", failureReason: "payment provider unavailable" });
      throw new PaymentProviderError("the payment provider for this payment is not available");
    }
    let result;
    try {
      result = await provider.refund({ providerRef: payment.providerRef, amount, reason: opts.reason, idempotencyKey: key });
    } catch (error) {
      await settleRefund(payment._id, { _id: refundId }, { status: "FAILED", failureReason: error instanceof Error ? error.message : "provider error" });
      throw error instanceof AppError ? error : new PaymentProviderError("the refund could not be requested");
    }
    if (result.status === "PENDING") {
      await PaymentModel.updateOne({ _id: payment._id, "refunds._id": refundId }, { $set: { "refunds.$.providerRefundRef": result.providerRefundRef } });
    } else {
      await settleRefund(payment._id, { _id: refundId }, { status: result.status, providerRefundRef: result.providerRefundRef, ...(result.failureReason ? { failureReason: result.failureReason } : {}) });
    }
    return { status: result.status, amount };
  }

  /** A refund that must happen whatever else does (money we cannot honour). Never throws: the failure is on the payment for someone to retry. */
  const refundQuietly = async (paymentId: string, reason: string) => {
    try {
      await refund(paymentId, { reason });
    } catch (error) {
      if (!(error instanceof ConflictError)) console.error(`[orders] automatic refund of payment ${paymentId} (${reason}) failed`, error);
    }
  };

  // ---- reacting to what the provider reports ----------------------------------------------------

  /** Money moved. Fulfil the order if it can still be fulfilled; otherwise the money goes back. */
  async function settleCapture(paymentId: string, reported: { amount: Paise; method?: string }): Promise<Outcome> {
    const payment = await PaymentModel.findById(paymentId);
    if (!payment) throw new NotFoundError("Payment", paymentId);
    const order = await OrderModel.findById(payment.orderId);
    if (!order) throw new NotFoundError("Order", String(payment.orderId));
    if (order.paymentId && String(order.paymentId) === payment.id) return "IGNORED"; // this capture already paid the order
    if (payment.refunds.length) return "IGNORED"; // we already decided this money goes back

    const capture = { $set: { status: "CAPTURED" as const, capturedAmount: reported.amount, capturedAt: clock(), ...(reported.method ? { method: reported.method } : {}) }, $unset: { failureReason: 1 as const } };
    let reason: string | undefined;
    if (order.paymentId) reason = "DUPLICATE_PAYMENT";
    else if (reported.amount !== payment.amount || payment.amount !== order.totals.total) reason = "AMOUNT_MISMATCH";
    else if (order.status !== "PENDING_PAYMENT" && order.status !== "PAYMENT_FAILED") reason = "ORDER_NOT_PAYABLE";

    if (!reason) {
      try {
        // One transaction: the money is recorded, the pieces are sold and the order is paid and confirmed — or none of it is.
        await withInventoryTransaction(async (session) => {
          await PaymentModel.findOneAndUpdate({ _id: payment._id, status: { $in: [...CAPTURABLE] } }, capture, { session });
          const paid = await moveOrder(order._id, "PAID", ["PENDING_PAYMENT", "PAYMENT_FAILED"], { session, at: clock(), reason: "Payment captured", set: { paidAt: clock(), paymentId: payment._id }, unset: ["holdExpiresAt"] });
          if (!paid) throw new NotPayableError();
          await sellPieces(session, paid);
          await moveOrder(order._id, "CONFIRMED", ["PAID"], { session, at: clock(), reason: "Stock secured and paid" });
        });
        return "APPLIED";
      } catch (error) {
        if (!(error instanceof NotPayableError) && !isStockConflict(error)) throw error;
        // A copy of this same event (or the customer's return) may have won a moment ago. If THIS payment paid the order, there is
        // nothing to undo — refunding it here would send back money the order is entitled to.
        const now = await OrderModel.findById(order._id);
        if (now?.paymentId && String(now.paymentId) === payment.id) return "IGNORED";
        reason = error instanceof NotPayableError ? (now?.paymentId ? "DUPLICATE_PAYMENT" : "ORDER_NOT_PAYABLE") : "STOCK_UNAVAILABLE";
      }
    }

    // The money has moved but the order cannot honour it. Record that truthfully, tidy the order, and send the money back.
    await PaymentModel.findOneAndUpdate({ _id: payment._id, status: { $in: [...CAPTURABLE] } }, capture);
    if (reason === "STOCK_UNAVAILABLE") {
      const cancelled = await moveOrder(order._id, "CANCELLED", ["PENDING_PAYMENT", "PAYMENT_FAILED"], { at: clock(), reason: "A piece was no longer available when payment arrived", set: { cancelledAt: clock(), cancelReason: "STOCK_UNAVAILABLE" }, unset: ["holdExpiresAt"] });
      if (cancelled) await releaseHeldPieces(cancelled, "Order cancelled: stock unavailable at payment");
    }
    await refundQuietly(payment.id, reason);
    return "APPLIED";
  }

  async function markFailed(payment: PaymentDocument, failureReason: string): Promise<Outcome> {
    const failed = await PaymentModel.findOneAndUpdate({ _id: payment._id, status: { $in: [...OPEN] } }, { $set: { status: "FAILED", failureReason } }, { new: true });
    if (!failed) return "IGNORED";
    // The order only needs another go at paying if this was its live attempt.
    const stillTrying = await PaymentModel.exists({ orderId: payment.orderId, status: { $in: [...OPEN] } });
    if (!stillTrying) await moveOrder(payment.orderId, "PAYMENT_FAILED", ["PENDING_PAYMENT"], { at: clock(), reason: failureReason });
    return "APPLIED";
  }

  /** Fold ONE report from the provider into our records. Idempotent, and a payment never goes backwards. */
  async function apply(payment: PaymentDocument, reported: { status: ReportedPaymentStatus; amount: Paise; method?: string; failureReason?: string }): Promise<Outcome> {
    switch (reported.status) {
      case "CAPTURED":
        return settleCapture(payment.id, reported);
      case "FAILED":
        return markFailed(payment, reported.failureReason ?? "Payment failed");
      case "AUTHORIZED": {
        if (!canAdvancePayment(payment.status, "AUTHORIZED")) return "IGNORED";
        const moved = await PaymentModel.findOneAndUpdate({ _id: payment._id, status: "PENDING" }, { $set: { status: "AUTHORIZED", ...(reported.method ? { method: reported.method } : {}) } });
        return moved ? "APPLIED" : "IGNORED";
      }
      default:
        return "IGNORED"; // still pending at the provider
    }
  }

  const paymentOf = async (order: OrderDocument, paymentId: string): Promise<PaymentDocument> => {
    if (!Types.ObjectId.isValid(paymentId)) throw new NotFoundError("Payment", paymentId);
    const payment = await PaymentModel.findOne({ _id: paymentId, orderId: order._id });
    if (!payment) throw new NotFoundError("Payment", paymentId);
    return payment;
  };

  return {
    view,
    refund,

    /** Start (or restart, after a failure) paying for an order. The provider is asked; nothing is assumed. */
    async initiate(order: OrderDocument, returnPath: string): Promise<StorePaymentStart> {
      const provider = providers.default(); // 503 when no gateway is configured — before anything is created
      const now = clock();
      if (order.status !== "PENDING_PAYMENT" && order.status !== "PAYMENT_FAILED") throw new ConflictError(`this order is ${order.status.replace("_", " ").toLowerCase()} and can't be paid`);
      if (!order.holdExpiresAt || order.holdExpiresAt <= now) throw new HoldExpiredError();

      // One live attempt at a time: an older unfinished one is written off (if it later succeeds, that money is refunded — see settleCapture).
      const older = await PaymentModel.find({ orderId: order._id, status: { $in: [...OPEN] } });
      for (const p of older) {
        await PaymentModel.updateOne({ _id: p._id, status: { $in: [...OPEN] } }, { $set: { status: "FAILED", failureReason: "SUPERSEDED" } });
        if (p.providerRef) await provider.cancel?.(p.providerRef).catch(() => undefined);
      }
      if (order.status === "PAYMENT_FAILED") await moveOrder(order._id, "PENDING_PAYMENT", ["PAYMENT_FAILED"], { at: now, reason: "Customer is trying to pay again" });

      const attempt = (await PaymentModel.countDocuments({ orderId: order._id })) + 1;
      const payment = await PaymentModel.create({ orderId: order._id, provider: provider.code, amount: order.totals.total, currency: "INR", status: "PENDING", attempt, idempotencyKey: `pay:${order.id}:${attempt}` });
      try {
        const started = await provider.initiate({
          paymentId: payment.id,
          orderNo: order.orderNo,
          amount: payment.amount,
          currency: "INR",
          customer: { name: order.customer.fullName, email: order.customer.email, phone: order.customer.phone },
          returnUrl: `${config.checkout.storeBaseUrl}${returnPath}`,
          idempotencyKey: payment.idempotencyKey,
        });
        await PaymentModel.updateOne({ _id: payment._id }, { $set: { providerRef: started.providerRef } });
        return { paymentId: payment.id, provider: provider.code, status: "PENDING", amount: payment.amount, action: started.action };
      } catch (error) {
        await markFailed(payment, "Could not start the payment");
        throw error instanceof AppError ? error : new PaymentProviderError("the payment could not be started");
      }
    },

    /** The customer is back from the payment page. Ask the provider what happened — never take the browser's word. */
    async verifyReturn(order: OrderDocument, paymentId: string, proof: Record<string, string>): Promise<StoreOrder> {
      const payment = await paymentOf(order, paymentId);
      const provider = providers.require(payment.provider);
      if (payment.providerRef) {
        const state: ProviderPaymentState = await provider.fetchStatus(payment.providerRef, proof);
        await apply(payment, state);
      }
      return view(order);
    },

    /** The customer closed the payment page. Unless the provider says they had in fact paid, that attempt is over and they may try again. */
    async cancelPayment(order: OrderDocument, paymentId: string): Promise<StoreOrder> {
      const payment = await paymentOf(order, paymentId);
      const provider = providers.require(payment.provider);
      if (payment.providerRef) {
        const state = await provider.fetchStatus(payment.providerRef);
        if (state.status === "CAPTURED") {
          await apply(payment, state);
          return view(order);
        }
        await provider.cancel?.(payment.providerRef).catch(() => undefined);
      }
      await markFailed(payment, "CUSTOMER_CANCELLED");
      return view(order);
    },

    /** Open payments on an order that is going away: void them so they cannot complete later. */
    async voidOpenPayments(orderId: Types.ObjectId, reason: string) {
      for (const p of await PaymentModel.find({ orderId, status: { $in: [...OPEN] } })) {
        await PaymentModel.updateOne({ _id: p._id, status: { $in: [...OPEN] } }, { $set: { status: "FAILED", failureReason: reason } });
        if (p.providerRef) await providers.get(p.provider)?.cancel?.(p.providerRef).catch(() => undefined);
      }
    },

    /** Ask the provider about every unfinished payment on an order (used before an expiry cancels it — the customer may have just paid). */
    async reconcileOpenPayments(orderId: Types.ObjectId) {
      for (const p of await PaymentModel.find({ orderId, status: { $in: [...OPEN] } })) {
        const provider = p.providerRef ? providers.get(p.provider) : undefined;
        if (!provider || !p.providerRef) continue;
        try {
          await apply(p, await provider.fetchStatus(p.providerRef));
        } catch {
          /* the provider is unreachable: leave the payment as it is */
        }
      }
    },

    /**
     * A provider's webhook. The body is verified by the adapter, recorded, and applied — exactly once. A redelivery of an event
     * already applied is acknowledged and does nothing; an event for a payment we don't know yet (it beat our own write of the
     * provider reference) is answered non-2xx so the provider sends it again.
     */
    async handleWebhook(providerCode: string, rawBody: string, headers: Record<string, string | undefined>): Promise<{ status: "processed" | "duplicate" | "ignored" | "unknown_payment"; outcome?: Outcome }> {
      const provider = providers.get(providerCode);
      if (!provider) throw new WebhookRejectedError("unknown payment provider");
      const event: ProviderEvent | null = provider.parseWebhook(rawBody, headers); // throws WebhookRejectedError if the signature is bad
      if (!event) return { status: "ignored" };

      const payment = await PaymentModel.findOne({ provider: providerCode, providerRef: event.providerRef });
      if (!payment) return { status: "unknown_payment" };

      const fresh = { provider: providerCode, eventId: event.eventId, type: event.type, providerRef: event.providerRef, ...(event.amount !== undefined ? { amount: event.amount } : {}), receivedAt: clock() };
      let record;
      try {
        record = await PaymentEventModel.findOneAndUpdate({ provider: providerCode, eventId: event.eventId }, { $setOnInsert: fresh }, { upsert: true, new: true });
      } catch (error) {
        if ((error as { code?: number })?.code !== 11000) throw error;
        record = await PaymentEventModel.findOne({ provider: providerCode, eventId: event.eventId }); // a copy of this delivery inserted it first
      }
      if (!record || record.processedAt) return { status: "duplicate" };

      let outcome: Outcome = "IGNORED";
      switch (event.type) {
        case "PAYMENT_CAPTURED":
          outcome = await apply(payment, { status: "CAPTURED", amount: event.amount ?? payment.amount, ...(event.method ? { method: event.method } : {}) });
          break;
        case "PAYMENT_AUTHORIZED":
          outcome = await apply(payment, { status: "AUTHORIZED", amount: event.amount ?? payment.amount, ...(event.method ? { method: event.method } : {}) });
          break;
        case "PAYMENT_FAILED":
          outcome = await apply(payment, { status: "FAILED", amount: payment.amount, failureReason: event.failureReason ?? "Payment failed" });
          break;
        case "REFUND_SUCCEEDED":
        case "REFUND_FAILED": {
          const settled = await settleRefund(payment._id, { providerRefundRef: event.refundRef }, { status: event.type === "REFUND_SUCCEEDED" ? "SUCCEEDED" : "FAILED", ...(event.failureReason ? { failureReason: event.failureReason } : {}) });
          if (!settled && !payment.refunds.some((r) => r.providerRefundRef === event.refundRef && r.status !== "PENDING")) return { status: "unknown_payment" }; // beat our own record of the refund: have it resent
          outcome = settled ? "APPLIED" : "IGNORED";
          break;
        }
      }
      await PaymentEventModel.updateOne({ _id: record._id }, { $set: { processedAt: clock(), outcome } });
      return { status: "processed", outcome };
    },
  };
}
export type PaymentService = ReturnType<typeof createPaymentService>;
