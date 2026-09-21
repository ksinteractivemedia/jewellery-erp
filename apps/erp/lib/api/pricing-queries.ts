"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { PricingPreviewInput } from "@jewellery/validation";
import { pricingApi } from "./pricing";

export const pricingKeys = {
  meta: ["pricing", "meta"] as const,
  preview: (input: PricingPreviewInput) => ["pricing", "preview", input] as const,
};

export const usePricingMeta = () => useQuery({ queryKey: pricingKeys.meta, queryFn: pricingApi.meta, staleTime: 5 * 60_000 });

/** A what-if calculation, re-run whenever the request changes. Nothing is stored, so it is a query, not a mutation. */
export const usePricingPreview = (input: PricingPreviewInput | null) =>
  useQuery({
    queryKey: input ? pricingKeys.preview(input) : ["pricing", "preview", "idle"],
    queryFn: () => pricingApi.preview(input!),
    enabled: input !== null,
    placeholderData: keepPreviousData,
    retry: false,
  });
