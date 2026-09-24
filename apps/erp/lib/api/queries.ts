"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@jewellery/ui";
import type { ProductListQueryInput } from "@jewellery/validation";
import { ApiError } from "../auth/api-client";
import { catalogApi } from "./catalog";

export const catalogKeys = {
  all: ["catalog"] as const,
  products: (query: ProductListQueryInput) => ["catalog", "products", query] as const,
  product: (id: string) => ["catalog", "product", id] as const,
  meta: ["catalog", "meta"] as const,
  categories: ["catalog", "categories"] as const,
  collections: ["catalog", "collections"] as const,
};

export const errorMessage = (error: unknown) => (error instanceof ApiError || error instanceof Error ? error.message : "Something went wrong");

export const useProducts = (query: ProductListQueryInput) =>
  useQuery({ queryKey: catalogKeys.products(query), queryFn: () => catalogApi.listProducts(query), placeholderData: keepPreviousData });

export const useProduct = (id: string) => useQuery({ queryKey: catalogKeys.product(id), queryFn: () => catalogApi.getProduct(id) });
export const useCatalogMeta = () => useQuery({ queryKey: catalogKeys.meta, queryFn: catalogApi.meta, staleTime: 5 * 60_000 });
export const useCategories = () => useQuery({ queryKey: catalogKeys.categories, queryFn: catalogApi.listCategories, staleTime: 5 * 60_000 });
export const useCollections = () => useQuery({ queryKey: catalogKeys.collections, queryFn: catalogApi.listCollections, staleTime: 5 * 60_000 });

/**
 * A mutation that, on success, refreshes every cache in `invalidate` (the catalogue and inventory are
 * small enough that precision would cost more than it saves: counts, list rows and stock cards all
 * depend on each other), toasts, and reports failures with the server's own message.
 */
export function useApiMutation<TVars, TResult>(
  fn: (vars: TVars) => Promise<TResult>,
  invalidate: readonly (readonly string[])[],
  opts: { success?: string | ((r: TResult) => string); onSuccess?: (r: TResult) => void; onError?: (e: unknown) => void } = {}
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: async (result) => {
      await Promise.all(invalidate.map((key) => qc.invalidateQueries({ queryKey: key })));
      const message = typeof opts.success === "function" ? opts.success(result) : opts.success;
      if (message) toast({ title: message, variant: "success" });
      opts.onSuccess?.(result);
    },
    onError: (error) => {
      toast({ title: "Couldn't save changes", description: errorMessage(error), variant: "danger" });
      opts.onError?.(error);
    },
  });
}

/** Catalogue mutations refresh the whole `catalog` cache. */
export const useCatalogMutation = <TVars, TResult>(fn: (vars: TVars) => Promise<TResult>, opts: Parameters<typeof useApiMutation<TVars, TResult>>[2] = {}) =>
  useApiMutation(fn, [catalogKeys.all], opts);
