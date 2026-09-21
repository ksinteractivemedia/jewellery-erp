import type { ActivityData, B2BData, DashboardAlert, DashboardMeta, DashboardSection, InventoryDashboard, OperationsDashboard, SalesData } from "@jewellery/types";
import type { DashboardQuery } from "@jewellery/validation";
import { BranchModel } from "../organization/branch.model";
import { LocationModel } from "../organization/location.model";
import { loadActivity } from "./activity-dashboard";
import { loadInventoryDashboard } from "./inventory-dashboard";
import { loadAlerts, loadOperations } from "./operations-dashboard";
import type { DashboardProviders, Honours } from "./providers";
import { businessDay, resolveRange } from "./range";
import { resolveScope } from "./scope";

const SALES_NOT_CONNECTED = {
  status: "NOT_CONNECTED",
  requires: "Orders module",
  explanation: "Revenue, margin, order counts and best-sellers are calculated from orders and invoices, which are not built yet. Nothing here is estimated.",
} as const;
const B2B_NOT_CONNECTED = {
  status: "NOT_CONNECTED",
  requires: "B2B, invoicing and credit modules",
  explanation: "Purchase orders, quotations, receivables and credit exposure come from the B2B portal, invoicing and credit accounts, which are not built yet. Nothing here is estimated.",
} as const;

/** Stock and queue sections are a snapshot of now, so a date range does not reach them. */
const SNAPSHOT: Honours = { dateRange: false, branch: true, location: true };
const OVER_TIME: Honours = { dateRange: true, branch: true, location: true };

/**
 * Composes the dashboard. Inventory and operations sections are read live from the database. Sales and B2B
 * come only from a registered provider; without one they say NOT_CONNECTED. Whether a caller may see cost-derived
 * margin is decided here, on the server — a withheld figure is never sent.
 */
export function createDashboardService(deps: { providers?: DashboardProviders; now?: () => Date } = {}) {
  const now = deps.now ?? (() => new Date());
  const providers = deps.providers ?? {};

  const ok = <T>(provenance: "LIVE" | "SAMPLE", honours: Honours, at: Date, range: { from: string; to: string }, data: T): DashboardSection<T> => ({
    status: "OK",
    provenance,
    scope: { asOf: at.toISOString(), ...(honours.dateRange ? { range: { from: range.from, to: range.to } } : {}), honours },
    data,
  });

  return {
    /** Branches and their locations — what the filter bar offers. */
    async meta(): Promise<DashboardMeta> {
      const [branches, locations] = await Promise.all([BranchModel.find({ isActive: true }).sort({ name: 1 }).lean(), LocationModel.find({ isActive: true }).sort({ name: 1 }).lean()]);
      return {
        today: businessDay(now()),
        branches: branches.map((b) => ({
          id: String(b._id),
          name: b.name,
          code: b.code,
          locations: locations.filter((l) => String(l.branchId) === String(b._id)).map((l) => ({ id: String(l._id), name: l.name, code: l.code, type: l.type })),
        })),
      };
    },

    async sales(q: DashboardQuery, caller: { canSeeMargin: boolean }): Promise<DashboardSection<SalesData>> {
      const provider = providers.sales;
      if (!provider) return SALES_NOT_CONNECTED;
      const at = now();
      const scope = await resolveScope(q);
      const range = resolveRange(q, at);
      const data = await provider.load({ range, now: at, ...(provider.honours.branch && scope.branchId ? { branchId: scope.branchId } : {}), ...(provider.honours.location && scope.locationId ? { locationId: scope.locationId } : {}) });
      return ok(provider.provenance, provider.honours, at, range, caller.canSeeMargin ? data : { ...data, grossMargin: { restricted: true } });
    },

    async b2b(q: DashboardQuery): Promise<DashboardSection<B2BData>> {
      const provider = providers.b2b;
      if (!provider) return B2B_NOT_CONNECTED;
      const at = now();
      const scope = await resolveScope(q);
      const range = resolveRange(q, at);
      return ok(provider.provenance, provider.honours, at, range, await provider.load({ range, now: at, ...(provider.honours.branch && scope.branchId ? { branchId: scope.branchId } : {}) }));
    },

    async inventory(q: DashboardQuery): Promise<DashboardSection<InventoryDashboard>> {
      const at = now();
      return ok("LIVE", SNAPSHOT, at, resolveRange(q, at), await loadInventoryDashboard(await resolveScope(q), at));
    },

    async operations(q: DashboardQuery): Promise<DashboardSection<OperationsDashboard>> {
      const at = now();
      return ok("LIVE", SNAPSHOT, at, resolveRange(q, at), await loadOperations(await resolveScope(q), at));
    },

    async alerts(q: DashboardQuery): Promise<DashboardSection<DashboardAlert[]>> {
      const at = now();
      return ok("LIVE", SNAPSHOT, at, resolveRange(q, at), await loadAlerts(await resolveScope(q), at));
    },

    async activity(q: DashboardQuery): Promise<DashboardSection<ActivityData>> {
      const at = now();
      const range = resolveRange(q, at);
      return ok("LIVE", OVER_TIME, at, range, await loadActivity(await resolveScope(q), range));
    },
  };
}
export type DashboardService = ReturnType<typeof createDashboardService>;
