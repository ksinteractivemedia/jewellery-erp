"use client";

import * as React from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Clock, Loader2, XCircle } from "lucide-react";
import { Skeleton, cn } from "@jewellery/ui";
import { StoreApiError } from "../../lib/api";
import { describeOrder } from "../../lib/checkout";
import { cancelOrder, checkoutKeys, startPayment, useOrder } from "../../lib/checkout-api";
import { formatDate, formatMoney, formatTime } from "../../lib/money";
import { orderTokens } from "../../lib/order-session";
import { OrderLines, Totals } from "./order-lines";
import { ReturnsSection } from "./returns-section";

/**
 * An order, as its customer sees it: what happened, what they bought at the price it was frozen at, and what they can still
 * do (pay, try again, cancel). Everything shown is the order's own record — nothing is recalculated, so it reads the same
 * next month whatever the gold rate does.
 */
export function OrderView({ orderNo }: { orderNo: string }) {
  const qc = useQueryClient();
  const [token, setToken] = React.useState<string | null | undefined>(undefined);
  React.useEffect(() => setToken(orderTokens.get(orderNo)), [orderNo]);
  const query = useOrder(orderNo, token ?? null);
  const [busy, setBusy] = React.useState<"pay" | "cancel" | null>(null);
  const [confirmCancel, setConfirmCancel] = React.useState(false);
  const [error, setError] = React.useState<string>();

  if (token === undefined) return <Skeleton className="h-64" />;
  if (!token || (query.error instanceof StoreApiError && query.error.status === 404)) {
    return (
      <div className="flex flex-col items-center gap-4 border border-dashed border-border py-20 text-center" role="alert" data-testid="order-unavailable">
        <h2 className="font-display text-h2">We can’t show this order here</h2>
        <p className="max-w-md text-body text-muted">For your security an order can only be opened on the device and browser tab where it was placed. Your confirmation will also reach you from us.</p>
        <Link href="/" className="btn btn-outline">Back to the shop</Link>
      </div>
    );
  }
  const order = query.data;
  if (!order) return query.isError ? <p className="py-16 text-center text-body text-muted" role="alert">We couldn’t load your order. Please refresh.</p> : <Skeleton className="h-64" />;

  const say = describeOrder(order);
  const Icon = say.tone === "good" ? CheckCircle2 : say.tone === "bad" ? XCircle : Clock;
  const pay = async () => {
    setBusy("pay");
    setError(undefined);
    try {
      const { payment } = await startPayment(orderNo, token, `/checkout/return?order=${orderNo}`);
      if (payment.action.type === "REDIRECT") return void window.location.assign(payment.action.url);
      setError("This payment method isn’t supported in this browser yet.");
    } catch (e) {
      setError(e instanceof StoreApiError ? e.message : "We couldn’t start the payment. Please try again.");
      await qc.invalidateQueries({ queryKey: checkoutKeys.order(orderNo) });
    }
    setBusy(null);
  };
  const cancel = async () => {
    setBusy("cancel");
    setError(undefined);
    try {
      const { order: next } = await cancelOrder(orderNo, token, "Cancelled from the order page");
      qc.setQueryData(checkoutKeys.order(orderNo), next);
      setConfirmCancel(false);
    } catch (e) {
      setError(e instanceof StoreApiError ? e.message : "We couldn’t cancel the order. Please try again.");
    }
    setBusy(null);
  };

  return (
    <div className="flex flex-col gap-10" data-testid="order-view">
      <div className={cn("flex gap-4 border p-6", say.tone === "good" ? "border-success" : say.tone === "bad" ? "border-danger" : "border-border")} role="status" data-testid="order-status" data-status={order.status}>
        <Icon className="mt-0.5 h-6 w-6 shrink-0" aria-hidden="true" />
        <div className="flex flex-col gap-1">
          <p className="eyebrow" data-testid="order-no">Order {order.orderNo}</p>
          <h2 className="font-display text-h2">{say.title}</h2>
          <p className="text-body text-muted">{say.body}</p>
          {order.holdExpiresAt && order.canPay && <p className="text-body-sm text-muted" data-testid="hold-until">Set aside for you until {formatTime(order.holdExpiresAt)}.</p>}
        </div>
      </div>

      {error && <p className="border border-danger p-4 text-body-sm" role="alert" data-testid="order-error">{error}</p>}

      {(order.canPay || order.canCancel) && (
        <div className="flex flex-wrap items-center gap-3">
          {order.canPay && <button type="button" className="btn btn-primary" onClick={pay} disabled={busy !== null} data-testid="pay-now">{busy === "pay" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}{order.status === "PAYMENT_FAILED" ? "Try payment again" : "Pay now"} · {formatMoney(order.totals.total)}</button>}
          {order.canCancel && !confirmCancel && <button type="button" className="btn btn-outline" onClick={() => setConfirmCancel(true)} data-testid="cancel-order">Cancel order</button>}
          {confirmCancel && (
            <span className="flex flex-wrap items-center gap-3 border border-border p-3 text-body-sm" role="alertdialog" aria-label="Confirm cancellation" data-testid="confirm-cancel">
              {order.payment?.status === "CAPTURED" ? "Cancel this order and refund your payment?" : "Cancel this order?"}
              <button type="button" className="btn btn-dark btn-sm" onClick={cancel} disabled={busy !== null} data-testid="confirm-cancel-yes">Yes, cancel</button>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => setConfirmCancel(false)}>Keep it</button>
            </span>
          )}
        </div>
      )}

      <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_420px] lg:gap-16">
        <section className="flex flex-col gap-5" aria-label="What you ordered">
          <h3 className="font-display text-h3">What you ordered</h3>
          <OrderLines items={order.items} />
          <p className="text-caption leading-relaxed text-muted">Placed {formatDate(order.placedAt)}. Each price is fixed as it was when you ordered — it does not change with the metal rate.</p>
        </section>
        <aside className="flex h-fit flex-col gap-6 bg-surface p-6 sm:p-8" aria-label="Order details">
          <Totals totals={order.totals} supplyType={order.supplyType} deliveryLabel={order.delivery.label} testId="order" />
          {order.payment && <p className="text-body-sm text-muted" data-testid="payment-status">Payment: {paymentWords(order.payment.status, order.payment.refundedAmount)}</p>}
          <div className="flex flex-col gap-1 text-body-sm"><span className="eyebrow">Delivering to</span><span>{order.customer.fullName}<br />{order.shippingAddress.line1}{order.shippingAddress.line2 && <>, {order.shippingAddress.line2}</>}<br />{order.shippingAddress.city}, {order.shippingAddress.state} {order.shippingAddress.postalCode}</span>{order.delivery.estimate && <span className="text-muted">{order.delivery.label} · {order.delivery.estimate}</span>}</div>
        </aside>
      </div>

      <ReturnsSection order={order} token={token} />
    </div>
  );
}

function paymentWords(status: string, refunded: number) {
  switch (status) {
    case "PENDING": return "waiting";
    case "AUTHORIZED": return "authorised, awaiting capture";
    case "CAPTURED": return "received";
    case "FAILED": return "not completed — nothing charged";
    case "PARTIALLY_REFUNDED": return `${formatMoney(refunded)} refunded`;
    case "REFUNDED": return `refunded (${formatMoney(refunded)})`;
    default: return status.toLowerCase();
  }
}
