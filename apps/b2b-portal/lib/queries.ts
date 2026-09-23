"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { B2BAccount, B2BAttachment, B2BCartQuote, B2BCatalogueResult, B2BDashboard, B2BInvoice, B2BOutstanding, B2BPayment, B2BPurchaseOrder, B2BQuotation, B2BSalesOrder, Return } from "@jewellery/types";
import { api, del, downloadFile, post, postFile } from "./api";
import type { CartLine } from "./cart";

/** Every hook is a plain read of the API's answer. The portal computes nothing: prices, credit and statuses all arrive from the backend. */
const get = <T,>(path: string) => api<T>(`/api/portal${path}`);
const P = "/api/portal";

export const key = {
  account: ["portal", "account"] as const,
  dashboard: ["portal", "dashboard"] as const,
  outstanding: ["portal", "outstanding"] as const,
  all: ["portal"] as const,
};

export const useAccount = () => useQuery({ queryKey: key.account, queryFn: async () => (await get<{ account: B2BAccount }>("/account")).account, staleTime: 30_000 });
export const useDashboard = () => useQuery({ queryKey: key.dashboard, queryFn: () => get<B2BDashboard>("/dashboard"), staleTime: 15_000 });
export const useOutstanding = () => useQuery({ queryKey: key.outstanding, queryFn: () => get<B2BOutstanding>("/outstanding"), staleTime: 15_000 });

export const useCatalogue = (qs: string) => useQuery({ queryKey: ["portal", "catalogue", qs], queryFn: () => get<B2BCatalogueResult>(`/catalogue?${qs}`), placeholderData: keepPreviousData, staleTime: 20_000 });

/** SKU + quantity in; priced, validated lines, totals and the credit position out. Used by both Quick Order and the Cart. */
export const useCartQuote = (lines: CartLine[], shippingAddressIndex?: number) =>
  useQuery({
    queryKey: ["portal", "cart-quote", lines, shippingAddressIndex],
    queryFn: () => post<B2BCartQuote>(`${P}/cart/quote`, { rows: lines.map((l) => ({ sku: l.sku, quantity: l.quantity })), ...(shippingAddressIndex !== undefined ? { shippingAddressIndex } : {}) }),
    enabled: lines.length > 0,
    placeholderData: keepPreviousData,
    staleTime: 0,
  });

export const usePurchaseOrders = () => useQuery({ queryKey: ["portal", "pos"], queryFn: async () => (await get<{ items: B2BPurchaseOrder[] }>("/purchase-orders")).items });
export const usePurchaseOrder = (id: string) => useQuery({ queryKey: ["portal", "po", id], enabled: !!id, queryFn: async () => (await get<{ purchaseOrder: B2BPurchaseOrder }>(`/purchase-orders/${id}`)).purchaseOrder });
export const useQuotations = () => useQuery({ queryKey: ["portal", "quotes"], queryFn: async () => (await get<{ items: B2BQuotation[] }>("/quotations")).items });
export const useQuotation = (id: string) => useQuery({ queryKey: ["portal", "quote", id], enabled: !!id, queryFn: async () => (await get<{ quotation: B2BQuotation }>(`/quotations/${id}`)).quotation });
export const useOrders = () => useQuery({ queryKey: ["portal", "orders"], queryFn: async () => (await get<{ items: B2BSalesOrder[] }>("/orders")).items });
export const useOrder = (id: string) => useQuery({ queryKey: ["portal", "order", id], enabled: !!id, queryFn: async () => (await get<{ order: B2BSalesOrder }>(`/orders/${id}`)).order });
export const useInvoices = () => useQuery({ queryKey: ["portal", "invoices"], queryFn: async () => (await get<{ items: B2BInvoice[] }>("/invoices")).items });
export const useInvoice = (id: string) => useQuery({ queryKey: ["portal", "invoice", id], enabled: !!id, queryFn: async () => (await get<{ invoice: B2BInvoice }>(`/invoices/${id}`)).invoice });
export const usePayments = () => useQuery({ queryKey: ["portal", "payments"], queryFn: async () => (await get<{ items: B2BPayment[] }>("/payments")).items });
export const useOrderReturns = (id: string) => useQuery({ queryKey: ["portal", "order", id, "returns"], enabled: !!id, queryFn: async () => (await get<{ items: Return[] }>(`/orders/${id}/returns`)).items });
export const requestOrderReturn = (id: string, lineRefs: string[], reason: string, reasonNote?: string) =>
  post<{ return: Return }>(`${P}/orders/${id}/returns`, { lineRefs, reason, ...(reasonNote ? { reasonNote } : {}) }).then((r) => r.return);

export const createPurchaseOrder = (body: object) => post<{ purchaseOrder: B2BPurchaseOrder }>(`${P}/purchase-orders`, body);
export const submitPurchaseOrder = (id: string) => post<{ purchaseOrder: B2BPurchaseOrder }>(`${P}/purchase-orders/${id}/submit`);
export const cancelPurchaseOrder = (id: string, reason?: string) => post<{ purchaseOrder: B2BPurchaseOrder }>(`${P}/purchase-orders/${id}/cancel`, reason ? { reason } : {});
export const addAttachment = (poId: string, file: File) => postFile<{ attachment: B2BAttachment }>(`${P}/purchase-orders/${poId}/attachments`, file);
export const removeAttachment = (poId: string, attachmentId: string) => del(`${P}/purchase-orders/${poId}/attachments/${attachmentId}`);
export const downloadAttachment = (poId: string, attachmentId: string, filename: string) => downloadFile(`${P}/purchase-orders/${poId}/attachments/${attachmentId}`, filename);
/** Accepting a quotation approves its purchase order at the quoted price; the seller still has to convert it into a sales order. */
export const acceptQuotation = (id: string) => post<{ purchaseOrder: B2BPurchaseOrder }>(`${P}/quotations/${id}/accept`);
export const counterQuotation = (id: string, body: object) => post<{ quotation: B2BQuotation }>(`${P}/quotations/${id}/counter`, body);
export const declineQuotation = (id: string, reason?: string) => post<{ quotation: B2BQuotation }>(`${P}/quotations/${id}/decline`, reason ? { reason } : {});
export const reportPayment = (body: object) => post<{ payment: B2BPayment }>(`${P}/payments`, body);
