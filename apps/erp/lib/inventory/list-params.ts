"use client";

import { inventoryListQuerySchema, type InventoryListQueryInput } from "@jewellery/validation";
import { useUrlParams } from "../url-params";

export const STOCK_VIEWS = ["items", "location", "sku", "purity", "metal"] as const;
export type StockView = (typeof STOCK_VIEWS)[number];
export type StockListParams = InventoryListQueryInput & { view: StockView };

const FILTER_KEYS = ["q", "status", "locationId", "metalId", "purity", "type", "productId", "hallmarkStatus", "availableForSale", "hasHuid"] as const;
const DEFAULTS = { sort: "updatedAt", order: "desc", page: 1, pageSize: 25, view: "items" } as const;

const parse = (raw: Record<string, string>): StockListParams => {
  const { view, ...rest } = raw;
  const parsed = inventoryListQuerySchema.safeParse(rest);
  const base = parsed.success ? (parsed.data as InventoryListQueryInput) : { ...DEFAULTS };
  return { ...base, view: (STOCK_VIEWS as readonly string[]).includes(view ?? "") ? (view as StockView) : "items" };
};

/** Filters, sort, page and the active tab all live in the URL — a filtered stock view is a shareable link. */
export const useStockListParams = () => useUrlParams<StockListParams>({ parse, defaults: DEFAULTS, filterKeys: FILTER_KEYS });

/** The list query proper (everything except the tab). */
export const toListQuery = ({ view: _view, ...q }: StockListParams): InventoryListQueryInput => ({ ...q, status: Array.isArray(q.status) ? (q.status.join(",") as never) : q.status });
