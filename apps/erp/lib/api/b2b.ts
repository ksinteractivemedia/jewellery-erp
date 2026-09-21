"use client";

import { useQuery } from "@tanstack/react-query";
import type { B2BAccount, B2BInvoice, B2BPayment, B2BPurchaseOrder, B2BQuotation, B2BSalesOrder, CreditPosition } from "@jewellery/types";
import { apiFetch } from "../auth/api-client";
import { useApiMutation } from "./queries";

export interface B2BCustomerRow {
  id: string;
  name: string;
  gstin?: string;
  territory?: string;
  groupName?: string;
  salesperson?: string;
  position: CreditPosition;
  isActive: boolean;
  paymentTermsDays: number;
  priceListCode?: string;
}

const json = (method: string, body?: unknown): RequestInit => ({ method, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
const qs = (o: Record<string, string | undefined>) => {
  const p = new URLSearchParams(Object.entries(o).filter(([, v]) => v) as [string, string][]);
  return p.size ? `?${p}` : "";
};
const list = <T,>(path: string, o: Record<string, string | undefined> = {}) => apiFetch<{ items: T[] }>(`/api/b2b${path}${qs(o)}`).then((r) => r.items);

/** The ERP never decides anything about wholesale: every figure and every verdict is the API's, and every action is a request the API may refuse. */
export const b2bApi = {
  customers: () => list<B2BCustomerRow>("/customers"),
  account: (id: string) => apiFetch<{ account: B2BAccount }>(`/api/b2b/customers/${id}`).then((r) => r.account),
  updateProfile: (id: string, body: object) => apiFetch<{ account: B2BAccount }>(`/api/b2b/customers/${id}/profile`, json("PATCH", body)),
  purchaseOrders: (status?: string) => list<B2BPurchaseOrder>("/purchase-orders", { status }),
  review: (id: string) => apiFetch(`/api/b2b/purchase-orders/${id}/review`, json("POST")),
  approve: (id: string, body: object) => apiFetch<{ order: B2BSalesOrder }>(`/api/b2b/purchase-orders/${id}/approve`, json("POST", body)),
  quote: (id: string, body: object) => apiFetch<{ quotation: B2BQuotation }>(`/api/b2b/purchase-orders/${id}/quote`, json("POST", body)),
  reject: (id: string, reason: string) => apiFetch(`/api/b2b/purchase-orders/${id}/reject`, json("POST", { reason })),
  quotations: (status?: string) => list<B2BQuotation>("/quotations", { status }),
  orders: (status?: string) => list<B2BSalesOrder>("/orders", { status }),
  approveCredit: (id: string, reason: string) => apiFetch(`/api/b2b/orders/${id}/approve-credit`, json("POST", { reason })),
  allocate: (id: string) => apiFetch(`/api/b2b/orders/${id}/allocate`, json("POST")),
  invoice: (id: string) => apiFetch(`/api/b2b/orders/${id}/invoice`, json("POST")),
  cancelOrder: (id: string, reason: string) => apiFetch(`/api/b2b/orders/${id}/cancel`, json("POST", { reason })),
  invoices: (status?: string) => list<B2BInvoice>("/invoices", { status }),
  payments: (status?: string) => list<B2BPayment>("/payments", { status }),
  recordPayment: (body: object) => apiFetch(`/api/b2b/payments`, json("POST", body)),
  verifyPayment: (id: string, note?: string) => apiFetch(`/api/b2b/payments/${id}/verify`, json("POST", note ? { note } : {})),
  rejectPayment: (id: string, reason: string) => apiFetch(`/api/b2b/payments/${id}/reject`, json("POST", { reason })),
  reversePayment: (id: string, reason: string) => apiFetch(`/api/b2b/payments/${id}/reverse`, json("POST", { reason })),
  allocatePayment: (id: string, allocations: { invoiceId: string; amount: number }[]) => apiFetch(`/api/b2b/payments/${id}/allocate`, json("POST", { allocations })),
};

const ALL = [["b2b"]] as const;
export const useB2BCustomers = () => useQuery({ queryKey: ["b2b", "customers"], queryFn: b2bApi.customers });
export const useB2BPurchaseOrders = (status?: string) => useQuery({ queryKey: ["b2b", "pos", status], queryFn: () => b2bApi.purchaseOrders(status) });
export const useB2BQuotations = () => useQuery({ queryKey: ["b2b", "quotes"], queryFn: () => b2bApi.quotations() });
export const useB2BOrders = () => useQuery({ queryKey: ["b2b", "orders"], queryFn: () => b2bApi.orders() });
export const useB2BInvoices = () => useQuery({ queryKey: ["b2b", "invoices"], queryFn: () => b2bApi.invoices() });
export const useB2BPayments = () => useQuery({ queryKey: ["b2b", "payments"], queryFn: () => b2bApi.payments() });

/** Any B2B action refreshes every B2B list: an approval changes the PO, the order, the credit position and the customer list at once. */
export const useB2BAction = <V,>(fn: (v: V) => Promise<unknown>, success: string, onSuccess?: () => void) => useApiMutation(fn, ALL as unknown as readonly (readonly string[])[], { success, ...(onSuccess ? { onSuccess } : {}) });
