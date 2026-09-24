"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { ReportDefinition, ReportKey, ReportResult } from "@jewellery/types";
import { API_URL, apiFetch, getAccessToken } from "../auth/api-client";
import { toQueryString } from "./catalog";

export interface ReportQuery {
  from?: string;
  to?: string;
  branchId?: string;
  locationId?: string;
  customerType?: "B2C" | "B2B";
  categoryId?: string;
  groupBy?: string;
  page?: number;
  pageSize?: number;
}

/** Every report shares this one contract — see `/api/reports`. Nothing here is computed client-side (CLAUDE.md rule 4): the browser only formats what the API already aggregated. */
export const reportsApi = {
  registry: () => apiFetch<{ items: ReportDefinition[] }>("/api/reports/registry").then((r) => r.items),
  run: (key: ReportKey, query: ReportQuery) => apiFetch<ReportResult>(`/api/reports/${key}${toQueryString(query as Record<string, unknown>)}`),
  /** A CSV file the browser saves, never a JSON array rendered in full — auth carried the same way a private B2B attachment download is (Bearer header, never a public URL). */
  download: async (key: ReportKey, query: ReportQuery, title: string) => {
    const res = await fetch(`${API_URL}/api/reports/${key}/export${toQueryString(query as Record<string, unknown>)}`, { headers: { authorization: `Bearer ${getAccessToken() ?? ""}` }, credentials: "include" });
    if (!res.ok) throw new Error(`Couldn't export ${title} (${res.status})`);
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement("a");
    a.href = url;
    a.download = `${key}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  },
};

export const useReportRegistry = () => useQuery({ queryKey: ["reports", "registry"], queryFn: reportsApi.registry, staleTime: 5 * 60_000 });
export const useReport = (key: ReportKey, query: ReportQuery) => useQuery({ queryKey: ["reports", key, query], queryFn: () => reportsApi.run(key, query), placeholderData: keepPreviousData });
