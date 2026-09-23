"use client";

import { useQuery } from "@tanstack/react-query";
import type { AssayingCentre, HallmarkingBatch, HallmarkingDashboard } from "@jewellery/types";
import { apiFetch } from "../auth/api-client";
import { useApiMutation } from "./queries";

const json = (method: string, body?: unknown): RequestInit => ({ method, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
const qs = (o: Record<string, string | undefined>) => {
  const p = new URLSearchParams(Object.entries(o).filter(([, v]) => v) as [string, string][]);
  return p.size ? `?${p}` : "";
};
const list = <T,>(path: string, o: Record<string, string | undefined> = {}) => apiFetch<{ items: T[] }>(`/api/hallmarking${path}${qs(o)}`).then((r) => r.items);

/** The ERP never decides anything about hallmarking: every status, HUID and history entry is the API's. */
export const hallmarkingApi = {
  dashboard: () => apiFetch<HallmarkingDashboard>("/api/hallmarking/dashboard"),
  itemHistory: (itemId: string) => list<HallmarkingBatch>(`/items/${itemId}/history`),

  centres: () => list<AssayingCentre>("/centres"),
  createCentre: (body: object) => apiFetch<{ centre: AssayingCentre }>("/api/hallmarking/centres", json("POST", body)),
  updateCentre: (id: string, body: object) => apiFetch<{ centre: AssayingCentre }>(`/api/hallmarking/centres/${id}`, json("PATCH", body)),

  batches: (status?: string) => list<HallmarkingBatch>("/batches", { status }),
  batch: (id: string) => apiFetch<{ batch: HallmarkingBatch }>(`/api/hallmarking/batches/${id}`).then((r) => r.batch),
  createBatch: (body: object) => apiFetch<{ batch: HallmarkingBatch }>("/api/hallmarking/batches", json("POST", body)),
  dispatch: (id: string) => apiFetch<{ batch: HallmarkingBatch }>(`/api/hallmarking/batches/${id}/dispatch`, json("POST")),
  arrive: (id: string, notes?: string) => apiFetch<{ batch: HallmarkingBatch }>(`/api/hallmarking/batches/${id}/arrive`, json("POST", notes ? { notes } : {})),
  receive: (id: string, lines: { itemId: string; huid?: string; certificateNumber?: string; hallmarkDate?: string }[]) => apiFetch<{ batch: HallmarkingBatch }>(`/api/hallmarking/batches/${id}/receive`, json("POST", { lines })),
  verify: (id: string, itemId: string, notes?: string) => apiFetch<{ batch: HallmarkingBatch }>(`/api/hallmarking/batches/${id}/lines/${itemId}/verify`, json("POST", notes ? { notes } : {})),
  fail: (id: string, itemId: string, failureReason: string) => apiFetch<{ batch: HallmarkingBatch }>(`/api/hallmarking/batches/${id}/lines/${itemId}/fail`, json("POST", { failureReason })),
  cancel: (id: string, reason?: string) => apiFetch<{ batch: HallmarkingBatch }>(`/api/hallmarking/batches/${id}/cancel`, json("POST", reason ? { reason } : {})),
};

const ALL = [["hallmarking"]] as const;
export const useHallmarkingDashboard = () => useQuery({ queryKey: ["hallmarking", "dashboard"], queryFn: hallmarkingApi.dashboard });
export const useItemHallmarkingHistory = (itemId: string) => useQuery({ queryKey: ["hallmarking", "item-history", itemId], queryFn: () => hallmarkingApi.itemHistory(itemId), enabled: !!itemId });
export const useAssayingCentres = () => useQuery({ queryKey: ["hallmarking", "centres"], queryFn: hallmarkingApi.centres });
export const useHallmarkingBatches = (status?: string) => useQuery({ queryKey: ["hallmarking", "batches", status], queryFn: () => hallmarkingApi.batches(status) });
export const useHallmarkingBatch = (id: string) => useQuery({ queryKey: ["hallmarking", "batch", id], queryFn: () => hallmarkingApi.batch(id), enabled: !!id });

/** Any hallmarking action refreshes every hallmarking list at once — dispatching a batch changes its own detail, the tab it's on and the dashboard counts together. */
export const useHallmarkingAction = <V,>(fn: (v: V) => Promise<unknown>, success: string, onSuccess?: () => void) => useApiMutation(fn, ALL as unknown as readonly (readonly string[])[], { success, ...(onSuccess ? { onSuccess } : {}) });
