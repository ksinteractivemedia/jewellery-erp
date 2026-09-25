"use client";

import { useQuery } from "@tanstack/react-query";
import type { MetalRate, PricingPlaygroundMeta } from "@jewellery/types";
import { apiFetch } from "../auth/api-client";
import { toQueryString } from "./catalog";
import { useApiMutation } from "./queries";

export interface CreateMetalRateBody {
  metalId: string;
  purity: string;
  /** Rupees, converted to paise before the request leaves this file — the API only ever sees integer paise. */
  ratePerGram: number;
  effectiveFrom: string;
  source: "MANUAL" | "FEED";
}

/** The one thing every price in the system (checkout, the B2B catalogue, every report) reads — entered here, nowhere else. */
export const metalsApi = {
  meta: () => apiFetch<PricingPlaygroundMeta>("/api/pricing/meta"),
  current: (metalId: string, purity: string) => apiFetch<{ rate: MetalRate | null }>(`/api/pricing/rates/current${toQueryString({ metalId, purity })}`).then((r) => r.rate),
  history: (metalId: string, purity: string) => apiFetch<{ items: MetalRate[] }>(`/api/pricing/rates${toQueryString({ metalId, purity })}`).then((r) => r.items),
  create: (body: CreateMetalRateBody) =>
    apiFetch<{ rate: MetalRate }>("/api/pricing/rates", {
      method: "POST",
      body: JSON.stringify({ ...body, ratePerGram: Math.round(body.ratePerGram * 100) }),
    }).then((r) => r.rate),
};

export const useMetalsMeta = () => useQuery({ queryKey: ["metals", "meta"], queryFn: metalsApi.meta, staleTime: 5 * 60_000 });
export const useCurrentRate = (metalId: string, purity: string) => useQuery({ queryKey: ["metals", "current", metalId, purity], queryFn: () => metalsApi.current(metalId, purity), enabled: !!metalId && !!purity });
export const useRateHistory = (metalId: string, purity: string) => useQuery({ queryKey: ["metals", "history", metalId, purity], queryFn: () => metalsApi.history(metalId, purity), enabled: !!metalId && !!purity });

export const useCreateMetalRate = () => useApiMutation(metalsApi.create, [["metals"]], { success: "Rate recorded" });
