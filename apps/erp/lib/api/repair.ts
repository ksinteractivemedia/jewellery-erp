"use client";

import { useQuery } from "@tanstack/react-query";
import type { RepairOrder } from "@jewellery/types";
import { apiFetch } from "../auth/api-client";
import { useApiMutation } from "./queries";

const json = (method: string, body?: unknown): RequestInit => ({ method, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
const qs = (o: Record<string, string | undefined>) => {
  const p = new URLSearchParams(Object.entries(o).filter(([, v]) => v) as [string, string][]);
  return p.size ? `?${p}` : "";
};

export const repairApi = {
  dashboard: () => apiFetch<{ counts: Record<string, number> }>("/api/repair/dashboard"),
  list: (o: { status?: string } = {}) => apiFetch<{ items: RepairOrder[] }>(`/api/repair${qs(o)}`).then((r) => r.items),
  get: (id: string) => apiFetch<{ repair: RepairOrder }>(`/api/repair/${id}`).then((r) => r.repair),
  intake: (body: object) => apiFetch<{ repair: RepairOrder }>("/api/repair", json("POST", body)).then((r) => r.repair),
  inspect: (id: string, body: object) => apiFetch<{ repair: RepairOrder }>(`/api/repair/${id}/inspect`, json("POST", body)).then((r) => r.repair),
  estimate: (id: string, body: object) => apiFetch<{ repair: RepairOrder }>(`/api/repair/${id}/estimate`, json("POST", body)).then((r) => r.repair),
  decideEstimate: (id: string, body: { approved: boolean; note?: string }) => apiFetch<{ repair: RepairOrder }>(`/api/repair/${id}/estimate/decide`, json("POST", body)).then((r) => r.repair),
  start: (id: string) => apiFetch<{ repair: RepairOrder }>(`/api/repair/${id}/start`, json("POST")).then((r) => r.repair),
  recordWork: (id: string, body: object) => apiFetch<{ repair: RepairOrder }>(`/api/repair/${id}/work`, json("POST", body)).then((r) => r.repair),
  qcPass: (id: string, notes?: string) => apiFetch<{ repair: RepairOrder }>(`/api/repair/${id}/qc/pass`, json("POST", notes ? { notes } : {})).then((r) => r.repair),
  qcFail: (id: string, notes?: string) => apiFetch<{ repair: RepairOrder }>(`/api/repair/${id}/qc/fail`, json("POST", notes ? { notes } : {})).then((r) => r.repair),
  rework: (id: string, reason?: string) => apiFetch<{ repair: RepairOrder }>(`/api/repair/${id}/rework`, json("POST", reason ? { reason } : {})).then((r) => r.repair),
  deliver: (id: string, note?: string) => apiFetch<{ repair: RepairOrder }>(`/api/repair/${id}/deliver`, json("POST", note ? { note } : {})).then((r) => r.repair),
  cancel: (id: string, reason?: string) => apiFetch<{ repair: RepairOrder }>(`/api/repair/${id}/cancel`, json("POST", reason ? { reason } : {})).then((r) => r.repair),
};

const ALL = [["repair"]] as const;
export const useRepairDashboard = () => useQuery({ queryKey: ["repair", "dashboard"], queryFn: repairApi.dashboard });
export const useRepairOrders = (o: { status?: string } = {}) => useQuery({ queryKey: ["repair", "list", o], queryFn: () => repairApi.list(o) });
export const useRepairOrder = (id: string) => useQuery({ queryKey: ["repair", "detail", id], queryFn: () => repairApi.get(id), enabled: !!id });
export const useRepairAction = <V, R>(fn: (v: V) => Promise<R>, success: string, onSuccess?: (r: R) => void) => useApiMutation(fn, ALL as unknown as readonly (readonly string[])[], { success, ...(onSuccess ? { onSuccess } : {}) });
