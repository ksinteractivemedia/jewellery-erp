"use client";

import { useQuery } from "@tanstack/react-query";
import type { Return, StoreCartLineInput, StoreCheckoutVerification, StoreOrder, StorePaymentStart } from "@jewellery/types";
import { storeGetAuthed, storePost } from "./api";
import { toVerifyBody } from "./checkout";

/** Every call here just carries the customer's choices to the API and brings back its answer. Nothing is computed in the browser. */
export const verifyCheckout = (body: ReturnType<typeof toVerifyBody>) => storePost<StoreCheckoutVerification>("/checkout/verify", body);

export const placeOrder = (body: object) => storePost<{ order: StoreOrder; accessToken: string }>("/checkout/orders", body);

const auth = (token: string) => ({ "x-order-token": token });
export const startPayment = (orderNo: string, token: string, returnPath: string) => storePost<{ payment: StorePaymentStart }>(`/orders/${orderNo}/payments`, { returnPath }, auth(token));
export const verifyPayment = (orderNo: string, token: string, paymentId: string, payload: Record<string, string>) => storePost<{ order: StoreOrder }>(`/orders/${orderNo}/payments/${paymentId}/verify`, { payload }, auth(token));
export const cancelPayment = (orderNo: string, token: string, paymentId: string) => storePost<{ order: StoreOrder }>(`/orders/${orderNo}/payments/${paymentId}/cancel`, {}, auth(token));
export const cancelOrder = (orderNo: string, token: string, reason?: string) => storePost<{ order: StoreOrder }>(`/orders/${orderNo}/cancel`, reason ? { reason } : {}, auth(token));

export const requestReturn = (orderNo: string, token: string, lineRefs: string[], reason: string, reasonNote?: string) =>
  storePost<{ return: Return }>(`/orders/${orderNo}/returns`, { lineRefs, reason, ...(reasonNote ? { reasonNote } : {}) }, auth(token)).then((r) => r.return);

export const checkoutKeys = {
  verify: (body: object) => ["store", "checkout-verify", body] as const,
  order: (orderNo: string) => ["store", "order", orderNo] as const,
  returns: (orderNo: string) => ["store", "order-returns", orderNo] as const,
};

/** Every return this order has, newest first — polled while one is still moving through its own workflow. */
export const useOrderReturns = (orderNo: string, token: string | null) =>
  useQuery({
    queryKey: checkoutKeys.returns(orderNo),
    queryFn: async () => (await storeGetAuthed<{ items: Return[] }>(`/orders/${orderNo}/returns`, token!)).items,
    enabled: !!token,
    staleTime: 0,
  });

/** The backend's recalculation of the bag. Never served from cache for long: a price is a moment in time. */
export const useCheckoutVerification = (lines: StoreCartLineInput[], state: string | undefined, deliveryCode: string | undefined, enabled: boolean) => {
  const body = toVerifyBody(lines, state, deliveryCode);
  return useQuery({ queryKey: checkoutKeys.verify(body), queryFn: () => verifyCheckout(body), enabled: enabled && lines.length > 0, staleTime: 0, gcTime: 60_000, refetchOnWindowFocus: true });
};

/** The order as the customer sees it; polled while it can still change under them (waiting for a payment to land). */
export const useOrder = (orderNo: string, token: string | null) =>
  useQuery({
    queryKey: checkoutKeys.order(orderNo),
    queryFn: async () => (await storeGetAuthed<{ order: StoreOrder }>(`/orders/${orderNo}`, token!)).order,
    enabled: !!token,
    staleTime: 0,
    retry: false,
    refetchInterval: (q) => (q.state.data?.status === "PENDING_PAYMENT" && q.state.data.canPay ? 5_000 : false),
  });
