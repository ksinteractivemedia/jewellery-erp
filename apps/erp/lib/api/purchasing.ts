"use client";

import { useQuery } from "@tanstack/react-query";
import type { GoodsReceipt, PurchaseDashboard, PurchaseOrder, PurchaseRequisition, Supplier, SupplierInvoice, SupplierOutstanding, SupplierPayment } from "@jewellery/types";
import { apiFetch } from "../auth/api-client";
import { useApiMutation } from "./queries";

export interface SupplierRow extends Supplier {
  totalOwed: number;
  overdue: number;
}

const json = (method: string, body?: unknown): RequestInit => ({ method, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
const qs = (o: Record<string, string | undefined>) => {
  const p = new URLSearchParams(Object.entries(o).filter(([, v]) => v) as [string, string][]);
  return p.size ? `?${p}` : "";
};
const list = <T,>(path: string, o: Record<string, string | undefined> = {}) => apiFetch<{ items: T[] }>(`/api/purchasing${path}${qs(o)}`).then((r) => r.items);

/** The ERP never decides anything about purchasing: every total, status and verdict is the API's, and every action is a request the API may refuse. */
export const purchasingApi = {
  dashboard: () => apiFetch<PurchaseDashboard>("/api/purchasing/dashboard"),

  suppliers: () => list<SupplierRow>("/suppliers"),
  supplier: (id: string) => apiFetch<{ supplier: Supplier }>(`/api/purchasing/suppliers/${id}`).then((r) => r.supplier),
  supplierOutstanding: (id: string) => apiFetch<{ outstanding: SupplierOutstanding }>(`/api/purchasing/suppliers/${id}/outstanding`).then((r) => r.outstanding),
  createSupplier: (body: object) => apiFetch<{ supplier: Supplier }>("/api/purchasing/suppliers", json("POST", body)),
  updateSupplier: (id: string, body: object) => apiFetch<{ supplier: Supplier }>(`/api/purchasing/suppliers/${id}`, json("PATCH", body)),

  requisitions: (status?: string) => list<PurchaseRequisition>("/requisitions", { status }),
  requisition: (id: string) => apiFetch<{ requisition: PurchaseRequisition }>(`/api/purchasing/requisitions/${id}`).then((r) => r.requisition),
  createRequisition: (body: object) => apiFetch<{ requisition: PurchaseRequisition }>("/api/purchasing/requisitions", json("POST", body)),
  submitRequisition: (id: string) => apiFetch<{ requisition: PurchaseRequisition }>(`/api/purchasing/requisitions/${id}/submit`, json("POST")),
  approveRequisition: (id: string, note?: string) => apiFetch<{ requisition: PurchaseRequisition }>(`/api/purchasing/requisitions/${id}/approve`, json("POST", note ? { note } : {})),
  rejectRequisition: (id: string, reason: string) => apiFetch<{ requisition: PurchaseRequisition }>(`/api/purchasing/requisitions/${id}/reject`, json("POST", { reason })),
  cancelRequisition: (id: string, reason?: string) => apiFetch<{ requisition: PurchaseRequisition }>(`/api/purchasing/requisitions/${id}/cancel`, json("POST", reason ? { reason } : {})),

  purchaseOrders: (status?: string) => list<PurchaseOrder>("/purchase-orders", { status }),
  purchaseOrder: (id: string) => apiFetch<{ purchaseOrder: PurchaseOrder }>(`/api/purchasing/purchase-orders/${id}`).then((r) => r.purchaseOrder),
  createPurchaseOrder: (body: object) => apiFetch<{ purchaseOrder: PurchaseOrder }>("/api/purchasing/purchase-orders", json("POST", body)),
  submitPurchaseOrder: (id: string) => apiFetch<{ purchaseOrder: PurchaseOrder }>(`/api/purchasing/purchase-orders/${id}/submit`, json("POST")),
  approvePurchaseOrder: (id: string, note?: string) => apiFetch<{ purchaseOrder: PurchaseOrder }>(`/api/purchasing/purchase-orders/${id}/approve`, json("POST", note ? { note } : {})),
  cancelPurchaseOrder: (id: string, reason?: string) => apiFetch<{ purchaseOrder: PurchaseOrder }>(`/api/purchasing/purchase-orders/${id}/cancel`, json("POST", reason ? { reason } : {})),
  receiveGoods: (id: string, body: object) => apiFetch<{ goodsReceipt: GoodsReceipt }>(`/api/purchasing/purchase-orders/${id}/receive`, json("POST", body)),
  goodsReceiptsForOrder: (id: string) => list<GoodsReceipt>(`/purchase-orders/${id}/goods-receipts`),

  goodsReceipts: () => list<GoodsReceipt>("/goods-receipts"),
  goodsReceipt: (id: string) => apiFetch<{ goodsReceipt: GoodsReceipt }>(`/api/purchasing/goods-receipts/${id}`).then((r) => r.goodsReceipt),

  supplierInvoices: (supplierId?: string) => list<SupplierInvoice>("/supplier-invoices", { supplierId }),
  supplierInvoice: (id: string) => apiFetch<{ supplierInvoice: SupplierInvoice }>(`/api/purchasing/supplier-invoices/${id}`).then((r) => r.supplierInvoice),
  createSupplierInvoice: (body: object) => apiFetch<{ supplierInvoice: SupplierInvoice }>("/api/purchasing/supplier-invoices", json("POST", body)),
  cancelSupplierInvoice: (id: string, reason: string) => apiFetch<{ supplierInvoice: SupplierInvoice }>(`/api/purchasing/supplier-invoices/${id}/cancel`, json("POST", { reason })),

  supplierPayments: (supplierId?: string) => list<SupplierPayment>("/supplier-payments", { supplierId }),
  recordSupplierPayment: (body: object) => apiFetch<{ supplierPayment: SupplierPayment }>("/api/purchasing/supplier-payments", json("POST", body)),
  allocateSupplierPayment: (id: string, allocations: { supplierInvoiceId: string; amount: number }[]) => apiFetch<{ supplierPayment: SupplierPayment }>(`/api/purchasing/supplier-payments/${id}/allocate`, json("POST", { allocations })),
  reverseSupplierPayment: (id: string, reason: string) => apiFetch<{ supplierPayment: SupplierPayment }>(`/api/purchasing/supplier-payments/${id}/reverse`, json("POST", { reason })),
};

const ALL = [["purchasing"]] as const;
export const usePurchaseDashboard = () => useQuery({ queryKey: ["purchasing", "dashboard"], queryFn: purchasingApi.dashboard });
export const useSuppliers = () => useQuery({ queryKey: ["purchasing", "suppliers"], queryFn: purchasingApi.suppliers });
export const useSupplierOutstanding = (id: string) => useQuery({ queryKey: ["purchasing", "supplier-outstanding", id], queryFn: () => purchasingApi.supplierOutstanding(id), enabled: !!id });
export const useRequisitions = (status?: string) => useQuery({ queryKey: ["purchasing", "requisitions", status], queryFn: () => purchasingApi.requisitions(status) });
export const usePurchaseOrders = (status?: string) => useQuery({ queryKey: ["purchasing", "pos", status], queryFn: () => purchasingApi.purchaseOrders(status) });
export const useGoodsReceipts = () => useQuery({ queryKey: ["purchasing", "grns"], queryFn: purchasingApi.goodsReceipts });
export const useSupplierInvoices = () => useQuery({ queryKey: ["purchasing", "invoices"], queryFn: () => purchasingApi.supplierInvoices() });
export const useSupplierPayments = () => useQuery({ queryKey: ["purchasing", "payments"], queryFn: () => purchasingApi.supplierPayments() });

/** Any purchasing action refreshes every purchasing list: receiving stock changes the PO, the goods-receipt list, the dashboard and the supplier position at once. */
export const usePurchasingAction = <V,>(fn: (v: V) => Promise<unknown>, success: string, onSuccess?: () => void) => useApiMutation(fn, ALL as unknown as readonly (readonly string[])[], { success, ...(onSuccess ? { onSuccess } : {}) });
