"use client";

import { zId } from "@jewellery/validation";
import { useUrlParams } from "../url-params";
import { DEFAULT_PRESET, isPreset, type RangePreset } from "./range";

export interface DashboardParams {
  range: RangePreset;
  from?: string;
  to?: string;
  branch?: string;
  location?: string;
}

const FILTER_KEYS = ["range", "from", "to", "branch", "location"] as const;
const DEFAULTS = { range: DEFAULT_PRESET } as const;

export function parseDashboardParams(raw: Record<string, string>): DashboardParams {
  return {
    range: isPreset(raw.range) ? raw.range : DEFAULT_PRESET,
    from: raw.from,
    to: raw.to,
    branch: zId.safeParse(raw.branch).success ? raw.branch : undefined,
    location: zId.safeParse(raw.location).success ? raw.location : undefined,
  };
}

/** The dashboard's filters live in the URL: a view of "Pune, last 7 days" is a link you can send someone. */
export const useDashboardParams = () => useUrlParams<DashboardParams>({ parse: parseDashboardParams, defaults: DEFAULTS, filterKeys: FILTER_KEYS });
