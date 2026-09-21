import type { OrderStatus, PaymentStatus } from "@jewellery/types";
import { ConflictError } from "../../shared/errors";

/**
 * The order lifecycle as data. Checkout walks DRAFT → PENDING_PAYMENT → PAID → CONFIRMED; PAYMENT_FAILED loops back to
 * PENDING_PAYMENT for a retry while the stock is still held. PACKED … RETURNED are fulfilment and aftercare, driven by
 * staff screens that do not exist yet — the rules are here so nothing can reach them by an illegal route later.
 * REFUNDED is where a cancelled-after-payment or returned order ends once the money is back.
 */
export const ORDER_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  DRAFT: ["PENDING_PAYMENT", "CANCELLED"],
  PENDING_PAYMENT: ["PAID", "PAYMENT_FAILED", "CANCELLED"],
  PAYMENT_FAILED: ["PENDING_PAYMENT", "PAID", "CANCELLED"], // PAID: the provider reports a late success for an attempt we had written off
  PAID: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["PACKED", "CANCELLED"],
  PACKED: ["SHIPPED", "CANCELLED"],
  SHIPPED: ["DELIVERED"],
  DELIVERED: ["RETURN_REQUESTED"],
  RETURN_REQUESTED: ["RETURNED", "DELIVERED"],
  RETURNED: ["REFUNDED"],
  CANCELLED: ["REFUNDED"],
  REFUNDED: [],
};

export const canTransitionOrder = (from: OrderStatus, to: OrderStatus) => ORDER_TRANSITIONS[from].includes(to);

export class IllegalOrderTransitionError extends ConflictError {
  constructor(from: OrderStatus, to: OrderStatus) {
    super(`an order cannot go from ${from} to ${to}`);
  }
}
export function assertOrderTransition(from: OrderStatus, to: OrderStatus): void {
  if (!canTransitionOrder(from, to)) throw new IllegalOrderTransitionError(from, to);
}

/** Statuses in which the customer still owes payment and the stock is (or may still be) held for them. */
export const UNPAID_STATUSES: readonly OrderStatus[] = ["DRAFT", "PENDING_PAYMENT", "PAYMENT_FAILED"];
/** The customer may cancel up to the moment the parcel is packed. After that it is a return. */
export const CUSTOMER_CANCELLABLE: readonly OrderStatus[] = ["PENDING_PAYMENT", "PAYMENT_FAILED", "PAID", "CONFIRMED"];
/** Statuses in which money has been taken and not (fully) returned. */
export const PAID_STATUSES: readonly OrderStatus[] = ["PAID", "CONFIRMED", "PACKED", "SHIPPED", "DELIVERED", "RETURN_REQUESTED", "RETURNED"];

// ---- payments -----------------------------------------------------------------------------------

/** What a provider can report about a payment (refunds are tracked separately and fold into REFUNDED / PARTIALLY_REFUNDED). */
export type ReportedPaymentStatus = "PENDING" | "AUTHORIZED" | "CAPTURED" | "FAILED";

/**
 * May a payment in `from` move to what the provider now reports? Providers deliver events late, twice and out of order, so
 * a payment only ever moves FORWARD: a stale "authorized" after "captured" is ignored, a repeat of the current state is a
 * no-op. FAILED → CAPTURED is allowed because the provider, not us, is the authority on whether money moved (a customer
 * can finish paying in another tab after we wrote the attempt off) — that money then has to be honoured or refunded.
 */
export function canAdvancePayment(from: PaymentStatus, to: ReportedPaymentStatus): boolean {
  switch (from) {
    case "PENDING":
      return to === "AUTHORIZED" || to === "CAPTURED" || to === "FAILED";
    case "AUTHORIZED":
      return to === "CAPTURED" || to === "FAILED";
    case "FAILED":
      return to === "CAPTURED";
    default:
      return false; // CAPTURED / REFUNDED / PARTIALLY_REFUNDED: only refunds move it now
  }
}

/** The payment's status from the money actually moved. */
export function paymentStatusFor(p: { status: PaymentStatus; capturedAmount: number; refundedAmount: number }): PaymentStatus {
  if (p.capturedAmount <= 0) return p.status;
  if (p.refundedAmount <= 0) return "CAPTURED";
  return p.refundedAmount >= p.capturedAmount ? "REFUNDED" : "PARTIALLY_REFUNDED";
}
