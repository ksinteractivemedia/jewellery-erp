import type { ActivityData, B2BData, DashboardAlert, DashboardMeta, DashboardSection, InventoryDashboard, OperationsDashboard, SalesData } from "@jewellery/types";
import { apiFetch } from "../auth/api-client";
import { toQueryString } from "./catalog";

export interface DashboardFilters {
  from?: string;
  to?: string;
  branchId?: string;
  locationId?: string;
}

const base = "/api/dashboard";
const get = <T>(section: string, f: DashboardFilters) => apiFetch<DashboardSection<T>>(`${base}/${section}${toQueryString(f as Record<string, unknown>)}`);

/** One call per section, so each loads, fails and is permissioned on its own. The ERP computes none of these figures. */
export const dashboardApi = {
  meta: () => apiFetch<DashboardMeta>(`${base}/meta`),
  sales: (f: DashboardFilters) => get<SalesData>("sales", f),
  b2b: (f: DashboardFilters) => get<B2BData>("b2b", f),
  inventory: (f: DashboardFilters) => get<InventoryDashboard>("inventory", f),
  operations: (f: DashboardFilters) => get<OperationsDashboard>("operations", f),
  alerts: (f: DashboardFilters) => get<DashboardAlert[]>("alerts", f),
  activity: (f: DashboardFilters) => get<ActivityData>("activity", f),
};
