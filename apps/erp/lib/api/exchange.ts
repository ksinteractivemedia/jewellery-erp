"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { Exchange } from "@jewellery/types";
import { apiFetch } from "../auth/api-client";
import { useApiMutation } from "./queries";

const json = (method: string, body?: unknown): RequestInit => ({ method, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
const qs = (o: Record<string, string | undefined>) => {
  const p = new URLSearchParams(Object.entries(o).filter(([, v]) => v) as [string, string][]);
  return p.size ? `?${p}` : "";
};

export const exchangeApi = {
  dashboard: () => apiFetch<{ counts: Record<string, number> }>("/api/exchange/dashboard"),
  list: (o: { status?: string } = {}) => apiFetch<{ items: Exchange[] }>(`/api/exchange${qs(o)}`).then((r) => r.items),
  get: (id: string) => apiFetch<{ exchange: Exchange }>(`/api/exchange/${id}`).then((r) => r.exchange),
  create: (body: object) => apiFetch<{ exchange: Exchange }>("/api/exchange", json("POST", body)).then((r) => r.exchange),
  assess: (id: string, body: object) => apiFetch<{ exchange: Exchange }>(`/api/exchange/${id}/assess`, json("POST", body)).then((r) => r.exchange),
  complete: (id: string, body: object) => apiFetch<{ exchange: Exchange }>(`/api/exchange/${id}/complete`, json("POST", body)).then((r) => r.exchange),
  cancel: (id: string, reason?: string) => apiFetch<{ exchange: Exchange }>(`/api/exchange/${id}/cancel`, json("POST", reason ? { reason } : {})).then((r) => r.exchange),
};

const ALL = [["exchange"]] as const;
export const useExchangeDashboard = () => useQuery({ queryKey: ["exchange", "dashboard"], queryFn: exchangeApi.dashboard });
export const useExchanges = (o: { status?: string } = {}) => useQuery({ queryKey: ["exchange", "list", o], queryFn: () => exchangeApi.list(o), placeholderData: keepPreviousData });
export const useExchange = (id: string) => useQuery({ queryKey: ["exchange", "detail", id], queryFn: () => exchangeApi.get(id), enabled: !!id });
export const useExchangeAction = <V, R>(fn: (v: V) => Promise<R>, success: string, onSuccess?: (r: R) => void) => useApiMutation(fn, ALL as unknown as readonly (readonly string[])[], { success, ...(onSuccess ? { onSuccess } : {}) });
