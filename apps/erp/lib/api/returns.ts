"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { Return } from "@jewellery/types";
import { apiFetch } from "../auth/api-client";
import { useApiMutation } from "./queries";

const json = (method: string, body?: unknown): RequestInit => ({ method, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
const qs = (o: Record<string, string | undefined>) => {
  const p = new URLSearchParams(Object.entries(o).filter(([, v]) => v) as [string, string][]);
  return p.size ? `?${p}` : "";
};

/** The ERP never decides a return's status or refundable total — every figure is the API's. */
export const returnsApi = {
  dashboard: () => apiFetch<{ counts: Record<string, number> }>("/api/returns/dashboard"),
  list: (o: { status?: string; channel?: string } = {}) => apiFetch<{ items: Return[] }>(`/api/returns${qs(o)}`).then((r) => r.items),
  get: (id: string) => apiFetch<{ return: Return }>(`/api/returns/${id}`).then((r) => r.return),
  requestB2C: (body: { orderId: string; itemIds: string[]; reason: string; reasonNote?: string }) => apiFetch<{ return: Return }>("/api/returns/b2c", json("POST", body)).then((r) => r.return),
  requestB2B: (body: { orderId: string; itemIds: string[]; reason: string; reasonNote?: string }) => apiFetch<{ return: Return }>("/api/returns/b2b", json("POST", body)).then((r) => r.return),
  approve: (id: string, note?: string) => apiFetch<{ return: Return }>(`/api/returns/${id}/approve`, json("POST", note ? { note } : {})).then((r) => r.return),
  reject: (id: string, reason: string) => apiFetch<{ return: Return }>(`/api/returns/${id}/reject`, json("POST", { reason })).then((r) => r.return),
  receive: (id: string, body: { destinationLocationId: string; lines: { itemId: string; observedHuid?: string; observedGrossWeight?: number; weightDiscrepancyNote?: string }[] }) =>
    apiFetch<{ return: Return }>(`/api/returns/${id}/receive`, json("POST", body)).then((r) => r.return),
  inspect: (id: string, lines: { itemId: string; condition: string; conditionNote?: string }[]) => apiFetch<{ return: Return }>(`/api/returns/${id}/inspect`, json("POST", { lines })).then((r) => r.return),
  settle: (id: string, body: { method: string; amount: number; reference?: string; note?: string }) => apiFetch<{ return: Return }>(`/api/returns/${id}/settle`, json("POST", body)).then((r) => r.return),
  cancel: (id: string, reason?: string) => apiFetch<{ return: Return }>(`/api/returns/${id}/cancel`, json("POST", reason ? { reason } : {})).then((r) => r.return),
};

const ALL = [["returns"]] as const;
export const useReturnsDashboard = () => useQuery({ queryKey: ["returns", "dashboard"], queryFn: returnsApi.dashboard });
export const useReturns = (o: { status?: string; channel?: string } = {}) => useQuery({ queryKey: ["returns", "list", o], queryFn: () => returnsApi.list(o), placeholderData: keepPreviousData });
export const useReturn = (id: string) => useQuery({ queryKey: ["returns", "detail", id], queryFn: () => returnsApi.get(id), enabled: !!id });
export const useReturnAction = <V, R>(fn: (v: V) => Promise<R>, success: string, onSuccess?: (r: R) => void) => useApiMutation(fn, ALL as unknown as readonly (readonly string[])[], { success, ...(onSuccess ? { onSuccess } : {}) });
