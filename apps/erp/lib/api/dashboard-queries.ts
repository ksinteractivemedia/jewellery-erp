"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { dashboardApi, type DashboardFilters } from "./dashboard";

export const dashboardKeys = {
  all: ["dashboard"] as const,
  meta: ["dashboard", "meta"] as const,
  section: (name: string, f: DashboardFilters) => ["dashboard", name, f] as const,
};

const REFRESH_MS = 60_000;

export const useDashboardMeta = () => useQuery({ queryKey: dashboardKeys.meta, queryFn: dashboardApi.meta, staleTime: 5 * 60_000 });

function section<T>(name: string, fetcher: (f: DashboardFilters) => Promise<T>) {
  return (filters: DashboardFilters, enabled: boolean) =>
    useQuery({
      queryKey: dashboardKeys.section(name, filters),
      queryFn: () => fetcher(filters),
      enabled,
      staleTime: 30_000,
      refetchInterval: REFRESH_MS,
      // Changing a filter keeps the previous figures on screen (dimmed) until the new ones arrive — no flash of skeletons.
      placeholderData: keepPreviousData,
      retry: false,
    });
}

export const useSalesSection = section("sales", dashboardApi.sales);
export const useB2BSection = section("b2b", dashboardApi.b2b);
export const useInventorySection = section("inventory", dashboardApi.inventory);
export const useOperationsSection = section("operations", dashboardApi.operations);
export const useAlertsSection = section("alerts", dashboardApi.alerts);
export const useActivitySection = section("activity", dashboardApi.activity);
