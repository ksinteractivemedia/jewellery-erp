"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { JobWorkOrder, ProductionOrder, ReconciliationRow } from "@jewellery/types";
import { apiFetch } from "../auth/api-client";
import { useApiMutation } from "./queries";

const json = (method: string, body?: unknown): RequestInit => ({ method, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
const qs = (o: Record<string, string | undefined>) => {
  const p = new URLSearchParams(Object.entries(o).filter(([, v]) => v) as [string, string][]);
  return p.size ? `?${p}` : "";
};
const list = <T,>(path: string, o: Record<string, string | undefined> = {}) => apiFetch<{ items: T[] }>(`/api/manufacturing${path}${qs(o)}`).then((r) => r.items);

export interface ManufacturingDashboard {
  counts: { draftProductionOrders: number; inProgress: number; qcPending: number; issuedJobWork: number; discrepancies: number };
}

/** The ERP never decides anything about manufacturing: every status, weight and reconciliation figure is the API's. */
export const manufacturingApi = {
  dashboard: () => apiFetch<ManufacturingDashboard>("/api/manufacturing/dashboard"),
  reconciliation: (discrepancyOnly?: boolean) => list<ReconciliationRow>("/reconciliation", discrepancyOnly ? { discrepancyOnly: "true" } : {}),

  productionOrders: (status?: string) => list<ProductionOrder>("/production-orders", { status }),
  productionOrder: (id: string) => apiFetch<{ productionOrder: ProductionOrder }>(`/api/manufacturing/production-orders/${id}`).then((r) => r.productionOrder),
  createProductionOrder: (body: object) => apiFetch<{ productionOrder: ProductionOrder }>("/api/manufacturing/production-orders", json("POST", body)),
  issueMaterial: (id: string, itemIds: string[]) => apiFetch<{ productionOrder: ProductionOrder }>(`/api/manufacturing/production-orders/${id}/issue-material`, json("POST", { itemIds })),
  startManufacturing: (id: string) => apiFetch<{ productionOrder: ProductionOrder }>(`/api/manufacturing/production-orders/${id}/start`, json("POST")),
  submitForQc: (id: string, body: object) => apiFetch<{ productionOrder: ProductionOrder }>(`/api/manufacturing/production-orders/${id}/submit-qc`, json("POST", body)),
  passQc: (id: string, notes?: string) => apiFetch<{ productionOrder: ProductionOrder }>(`/api/manufacturing/production-orders/${id}/qc/pass`, json("POST", notes ? { notes } : {})),
  failQc: (id: string, notes: string) => apiFetch<{ productionOrder: ProductionOrder }>(`/api/manufacturing/production-orders/${id}/qc/fail`, json("POST", { notes })),
  rework: (id: string) => apiFetch<{ productionOrder: ProductionOrder }>(`/api/manufacturing/production-orders/${id}/rework`, json("POST")),
  completeProduction: (id: string, body: object) => apiFetch<{ productionOrder: ProductionOrder }>(`/api/manufacturing/production-orders/${id}/complete`, json("POST", body)),
  cancelProduction: (id: string, reason?: string) => apiFetch<{ productionOrder: ProductionOrder }>(`/api/manufacturing/production-orders/${id}/cancel`, json("POST", reason ? { reason } : {})),

  jobWorkOrders: (status?: string) => list<JobWorkOrder>("/job-work-orders", { status }),
  jobWorkOrder: (id: string) => apiFetch<{ jobWorkOrder: JobWorkOrder }>(`/api/manufacturing/job-work-orders/${id}`).then((r) => r.jobWorkOrder),
  createJobWorkOrder: (body: object) => apiFetch<{ jobWorkOrder: JobWorkOrder }>("/api/manufacturing/job-work-orders", json("POST", body)),
  issueJobWork: (id: string, itemIds: string[]) => apiFetch<{ jobWorkOrder: JobWorkOrder }>(`/api/manufacturing/job-work-orders/${id}/issue`, json("POST", { itemIds })),
  returnJobWork: (id: string, body: object) => apiFetch<{ jobWorkOrder: JobWorkOrder }>(`/api/manufacturing/job-work-orders/${id}/return`, json("POST", body)),
  cancelJobWork: (id: string, reason?: string) => apiFetch<{ jobWorkOrder: JobWorkOrder }>(`/api/manufacturing/job-work-orders/${id}/cancel`, json("POST", reason ? { reason } : {})),
};

const ALL = [["manufacturing"]] as const;
export const useManufacturingDashboard = () => useQuery({ queryKey: ["manufacturing", "dashboard"], queryFn: manufacturingApi.dashboard });
export const useReconciliation = (discrepancyOnly?: boolean) => useQuery({ queryKey: ["manufacturing", "reconciliation", discrepancyOnly], queryFn: () => manufacturingApi.reconciliation(discrepancyOnly) });
export const useProductionOrders = (status?: string) => useQuery({ queryKey: ["manufacturing", "production-orders", status], queryFn: () => manufacturingApi.productionOrders(status), placeholderData: keepPreviousData });
export const useJobWorkOrders = (status?: string) => useQuery({ queryKey: ["manufacturing", "job-work-orders", status], queryFn: () => manufacturingApi.jobWorkOrders(status), placeholderData: keepPreviousData });

/** Any manufacturing action refreshes every manufacturing list — issuing material changes the order, the reconciliation view and the dashboard at once. */
export const useManufacturingAction = <V,>(fn: (v: V) => Promise<unknown>, success: string, onSuccess?: () => void) => useApiMutation(fn, ALL as unknown as readonly (readonly string[])[], { success, ...(onSuccess ? { onSuccess } : {}) });
