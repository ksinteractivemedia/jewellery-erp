import type {
  AdjustmentView,
  AuditLogEntry,
  InventoryItem,
  InventoryItemDetail,
  InventoryListResult,
  InventoryMeta,
  LedgerResult,
  ScanResolution,
  StockSummary,
  TransferView,
} from "@jewellery/types";
import type {
  InventoryListQueryInput,
  LedgerQueryInput,
  PartnerMovementInput,
  ReleaseItemsInput,
  RequestAdjustmentInput,
  ReserveItemsInput,
  StockSummaryQuery,
  CreateTransferInput,
  UpdateInventoryItemDetailsInput,
} from "@jewellery/validation";
import { apiFetch } from "../auth/api-client";
import { toQueryString } from "./catalog";

const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) });
const base = "/api/inventory";

export const inventoryApi = {
  meta: () => apiFetch<InventoryMeta>(`${base}/meta`),
  list: (q: InventoryListQueryInput) => apiFetch<InventoryListResult>(`${base}/items${toQueryString(q as Record<string, unknown>)}`),
  detail: (id: string) => apiFetch<{ item: InventoryItemDetail }>(`${base}/items/${id}`).then((r) => r.item),
  audit: (id: string) => apiFetch<{ entries: AuditLogEntry[] }>(`${base}/items/${id}/audit`).then((r) => r.entries),
  summary: (q: Pick<StockSummaryQuery, "groupBy"> & Partial<StockSummaryQuery>) => apiFetch<StockSummary>(`${base}/stock/summary${toQueryString({ ...q, status: q.status?.join(",") })}`),
  ledger: (q: LedgerQueryInput) => apiFetch<LedgerResult>(`${base}/ledger${toQueryString({ ...q, movementType: Array.isArray(q.movementType) ? q.movementType.join(",") : q.movementType })}`),
  scan: (code: string) => apiFetch<ScanResolution>(`${base}/scan${toQueryString({ code })}`),

  receive: (input: Record<string, unknown>) => apiFetch<{ item: InventoryItemDetail }>(`${base}/items`, json("POST", input)).then((r) => r.item),
  updateIdentifiers: (id: string, input: UpdateInventoryItemDetailsInput) => apiFetch<{ item: InventoryItemDetail }>(`${base}/items/${id}/identifiers`, json("PATCH", input)),
  reserve: (input: ReserveItemsInput) => apiFetch(`${base}/reservations`, json("POST", input)),
  release: (input: ReleaseItemsInput) => apiFetch(`${base}/reservations/release`, json("POST", input)),
  move: (input: PartnerMovementInput) => apiFetch(`${base}/movements`, json("POST", input)),
  inspectReturn: (input: { itemIds: string[]; outcome: "AVAILABLE" | "DAMAGED"; destinationLocationId: string; reason?: string }) => apiFetch(`${base}/returns/inspect`, json("POST", input)),

  listTransfers: (q: { status?: string; page?: number; pageSize?: number } = {}) => apiFetch<{ transfers: TransferView[]; total: number }>(`${base}/transfers${toQueryString(q)}`),
  createTransfer: (input: CreateTransferInput) => apiFetch<{ transfer: TransferView }>(`${base}/transfers`, json("POST", input)).then((r) => r.transfer),
  receiveTransfer: (id: string, itemIds?: string[]) => apiFetch(`${base}/transfers/${id}/receive`, json("POST", itemIds ? { itemIds } : {})),
  cancelTransfer: (id: string, reason?: string) => apiFetch(`${base}/transfers/${id}/cancel`, json("POST", { reason })),

  listAdjustments: (q: { status?: string; page?: number; pageSize?: number } = {}) => apiFetch<{ adjustments: AdjustmentView[]; total: number }>(`${base}/adjustments${toQueryString(q)}`),
  requestAdjustment: (input: RequestAdjustmentInput) => apiFetch(`${base}/adjustments`, json("POST", input)),
  approveAdjustment: (id: string, note?: string) => apiFetch(`${base}/adjustments/${id}/approve`, json("POST", { note })),
  rejectAdjustment: (id: string, note?: string) => apiFetch(`${base}/adjustments/${id}/reject`, json("POST", { note })),
};

export type { InventoryItem };
