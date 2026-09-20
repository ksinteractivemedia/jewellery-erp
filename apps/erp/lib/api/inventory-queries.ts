"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { InventoryListQueryInput, LedgerQueryInput, StockSummaryQuery } from "@jewellery/validation";
import { catalogKeys, useApiMutation } from "./queries";
import { inventoryApi } from "./inventory";

export const inventoryKeys = {
  all: ["inventory"] as const,
  meta: ["inventory", "meta"] as const,
  list: (q: InventoryListQueryInput) => ["inventory", "list", q] as const,
  detail: (id: string) => ["inventory", "detail", id] as const,
  audit: (id: string) => ["inventory", "audit", id] as const,
  summary: (q: unknown) => ["inventory", "summary", q] as const,
  ledger: (q: unknown) => ["inventory", "ledger", q] as const,
  transfers: (q: unknown) => ["inventory", "transfers", q] as const,
  adjustments: (q: unknown) => ["inventory", "adjustments", q] as const,
};

export const useInventoryMeta = () => useQuery({ queryKey: inventoryKeys.meta, queryFn: inventoryApi.meta, staleTime: 5 * 60_000 });
export const useInventoryList = (q: InventoryListQueryInput) => useQuery({ queryKey: inventoryKeys.list(q), queryFn: () => inventoryApi.list(q), placeholderData: keepPreviousData });
export const useInventoryItem = (id: string) => useQuery({ queryKey: inventoryKeys.detail(id), queryFn: () => inventoryApi.detail(id), enabled: Boolean(id) });
export const useItemAudit = (id: string, enabled = true) => useQuery({ queryKey: inventoryKeys.audit(id), queryFn: () => inventoryApi.audit(id), enabled });
export const useStockSummary = (q: Pick<StockSummaryQuery, "groupBy"> & Partial<StockSummaryQuery>, enabled = true) =>
  useQuery({ queryKey: inventoryKeys.summary(q), queryFn: () => inventoryApi.summary(q), enabled, placeholderData: keepPreviousData });
export const useLedger = (q: LedgerQueryInput) => useQuery({ queryKey: inventoryKeys.ledger(q), queryFn: () => inventoryApi.ledger(q), placeholderData: keepPreviousData });
export const useTransfers = (q: { status?: string; page?: number } = {}) => useQuery({ queryKey: inventoryKeys.transfers(q), queryFn: () => inventoryApi.listTransfers(q), placeholderData: keepPreviousData });
export const useAdjustments = (q: { status?: string; page?: number } = {}) => useQuery({ queryKey: inventoryKeys.adjustments(q), queryFn: () => inventoryApi.listAdjustments(q), placeholderData: keepPreviousData });

/**
 * Every stock operation refreshes inventory (rows, summaries, ledger, transfers, adjustments all
 * describe the same stock) and the catalogue's product detail, which shows piece counts.
 */
export const useInventoryMutation = <TVars, TResult>(fn: (vars: TVars) => Promise<TResult>, opts: Parameters<typeof useApiMutation<TVars, TResult>>[2] = {}) =>
  useApiMutation(fn, [inventoryKeys.all, catalogKeys.all], opts);
