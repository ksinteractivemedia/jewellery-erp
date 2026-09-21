import type { PriceBreakdown, PricingPlaygroundMeta } from "@jewellery/types";
import type { PricingPreviewInput } from "@jewellery/validation";
import { apiFetch } from "../auth/api-client";

const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) });

/** The ERP never prices anything itself: every figure on the playground comes back from this endpoint. */
export const pricingApi = {
  meta: () => apiFetch<PricingPlaygroundMeta>("/api/pricing/meta"),
  preview: (input: PricingPreviewInput) => apiFetch<{ breakdown: PriceBreakdown }>("/api/pricing/preview", json("POST", input)).then((r) => r.breakdown),
};
