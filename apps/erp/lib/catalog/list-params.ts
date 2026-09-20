"use client";

import { productListQuerySchema, type ProductListQueryInput } from "@jewellery/validation";
import { useUrlParams } from "../url-params";

/** Everything the list filters on, minus paging/sorting — a change to any of these resets to page 1. */
const FILTER_KEYS = ["q", "categoryId", "collectionId", "metalId", "purity", "tag", "isActive", "b2cEnabled", "b2bEnabled"] as const;
const DEFAULTS = { sort: "updatedAt", order: "desc", page: 1, pageSize: 25 } as const;

const parse = (raw: Record<string, string>): ProductListQueryInput => {
  const parsed = productListQuerySchema.safeParse(raw);
  return parsed.success ? (parsed.data as ProductListQueryInput) : { ...DEFAULTS };
};

export const useProductListParams = () => useUrlParams<ProductListQueryInput>({ parse, defaults: DEFAULTS, filterKeys: FILTER_KEYS });
