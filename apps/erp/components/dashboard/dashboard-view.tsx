"use client";

import * as React from "react";
import { useIsFetching, useQueryClient } from "@tanstack/react-query";
import { LayoutDashboard, RefreshCw } from "lucide-react";
import { PERMISSIONS } from "@jewellery/types";
import { Alert, Button, EmptyState, PageHeader, Skeleton } from "@jewellery/ui";
import { dashboardKeys, useActivitySection, useAlertsSection, useB2BSection, useDashboardMeta, useInventorySection, useOperationsSection, useSalesSection } from "../../lib/api/dashboard-queries";
import { errorMessage } from "../../lib/api/queries";
import { useAuth } from "../../lib/auth/auth-context";
import { useDashboardParams } from "../../lib/dashboard/params";
import { resolveDashboardRange } from "../../lib/dashboard/range";
import { ActivityPanel } from "./activity-panel";
import { AttentionPanel } from "./attention-panel";
import { B2BPanel } from "./b2b-panel";
import { DashboardFilterBar } from "./filter-bar";
import { StockBreakdowns, StockPosition } from "./inventory-panel";
import { KpiStrip } from "./kpi-strip";
import { HallmarkingQueue, JobWorkQueue, RepairQueue, TransferQueue } from "./queues-panel";
import { ChannelSplit, RevenueTrend, TopCategories, TopProducts } from "./sales-panels";

const { INVENTORY_VIEW, SALES_VIEW, B2B_VIEW } = PERMISSIONS;

/**
 * The ERP dashboard. Composition only: which sections a person may see (by permission — the API enforces it
 * again), the URL-held filters, and one query per section. Every figure is computed by the API; where a module
 * doesn't exist yet the section says so, and where an adapter supplies sample data it is labelled.
 */
export function DashboardView() {
  const { can } = useAuth();
  const canSales = can(SALES_VIEW);
  const canB2B = can(B2B_VIEW);
  const canStock = can(INVENTORY_VIEW);

  const meta = useDashboardMeta();
  const { params, setParams, clearFilters } = useDashboardParams();
  const qc = useQueryClient();

  // "Today" is the server's business day, so the range is only known once the reference data has loaded.
  const today = meta.data?.today;
  const range = today ? resolveDashboardRange(params.range, today, { from: params.from, to: params.to }) : null;
  const known = (id: string | undefined, ids: string[]) => (id && ids.includes(id) ? id : undefined);
  const allLocations = meta.data?.branches.flatMap((b) => b.locations) ?? [];
  const locationId = meta.data ? known(params.location, allLocations.map((l) => l.id)) : undefined;
  const branchId = meta.data ? known(params.branch, meta.data.branches.map((b) => b.id)) : undefined;
  const stale = meta.data && ((params.location && !locationId) || (params.branch && !branchId));

  // A location filter alone implies its branch; the branch picker shows it.
  const impliedBranch = locationId ? meta.data?.branches.find((b) => b.locations.some((l) => l.id === locationId))?.id : undefined;
  const scope = { ...(branchId ? { branchId } : {}), ...(locationId ? { locationId } : {}) };
  const withRange = range ? { from: range.from, to: range.to, ...scope } : scope;

  const ready = Boolean(range);
  const sales = useSalesSection(withRange, ready && canSales);
  const b2b = useB2BSection(withRange, ready && canB2B);
  const inventory = useInventorySection(scope, ready && canStock);
  const operations = useOperationsSection(scope, ready && canStock);
  const alerts = useAlertsSection(scope, ready && canStock);
  const activity = useActivitySection(withRange, ready && canStock);

  const fetching = useIsFetching({ queryKey: dashboardKeys.all }) > 0;
  const updatedAt = Math.max(0, ...[sales, b2b, inventory, operations, alerts, activity].map((q) => q.dataUpdatedAt));
  const sampled = [sales.data, b2b.data].some((s) => s?.status === "OK" && s.provenance === "SAMPLE");

  const header = (
    <PageHeader
      title="Dashboard"
      description="The state of the business — and what needs you."
      actions={
        <>
          {updatedAt > 0 && <span className="hidden text-caption text-muted sm:inline" data-testid="updated-at">Updated {new Date(updatedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</span>}
          <Button variant="secondary" size="sm" onClick={() => qc.invalidateQueries({ queryKey: dashboardKeys.all })} disabled={fetching} data-testid="dashboard-refresh">
            <RefreshCw className={`h-3.5 w-3.5 ${fetching ? "animate-spin" : ""}`} aria-hidden="true" />Refresh
          </Button>
        </>
      }
    />
  );

  if (!canSales && !canB2B && !canStock) {
    return (
      <>
        {header}
        <EmptyState icon={<LayoutDashboard className="h-8 w-8" aria-hidden="true" />} title="Your role has no dashboard sections" description="The dashboard shows sales, B2B and stock figures to people who can view them. Ask an administrator if you need access." />
      </>
    );
  }
  if (meta.isError) {
    return (
      <>
        {header}
        <Alert variant="danger" title="Couldn’t load the dashboard filters"><div className="flex flex-col items-start gap-2"><span>{errorMessage(meta.error)}</span><Button size="sm" variant="secondary" onClick={() => meta.refetch()}>Retry</Button></div></Alert>
      </>
    );
  }
  if (!meta.data || !range) {
    return (
      <>
        {header}
        <div className="flex flex-col gap-4" aria-busy="true" data-testid="dashboard-loading"><Skeleton className="h-12" /><div className="grid grid-cols-2 gap-3 lg:grid-cols-6">{[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-24" />)}</div><Skeleton className="h-72" /></div>
      </>
    );
  }

  return (
    <>
      {header}
      <DashboardFilterBar
        meta={meta.data}
        params={params}
        range={range}
        branchId={branchId ?? impliedBranch}
        locationId={locationId}
        onChange={(patch) => setParams(patch)}
        onReset={clearFilters}
      />
      {stale && <Alert variant="info" className="mb-4" data-testid="stale-filter">That branch or location no longer exists, so everything is shown.</Alert>}
      {sampled && (
        <Alert variant="warning" title="Sales and B2B figures are sample data" className="mb-4" data-testid="sample-banner">
          Orders, invoicing and credit aren’t built yet. In development, a sample adapter feeds those sections so the layout can be exercised; each sample figure is labelled. Stock, queues, alerts and activity are live.
        </Alert>
      )}

      <div className="flex flex-col gap-6 pb-6" data-testid="dashboard">
        <KpiStrip salesQuery={canSales ? sales : null} b2bQuery={canB2B ? b2b : null} />

        {(canSales || canStock) && (
          <div className={`grid grid-cols-1 gap-4 ${canSales && canStock ? "xl:grid-cols-[minmax(0,1fr)_380px]" : ""}`}>
            {canSales && <RevenueTrend query={sales} />}
            {canStock && <AttentionPanel query={alerts} />}
          </div>
        )}

        {canStock && (
          <section aria-labelledby="ops-heading" className="flex flex-col gap-3" data-testid="operations">
            <h2 id="ops-heading" className="text-body font-medium text-foreground">Operations</h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              <JobWorkQueue query={operations} />
              <HallmarkingQueue query={operations} />
              <RepairQueue query={operations} />
              <TransferQueue query={operations} />
            </div>
          </section>
        )}

        {canSales && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <ChannelSplit query={sales} />
            <TopCategories query={sales} />
            <TopProducts query={sales} />
          </div>
        )}

        {canStock && (
          <section aria-label="Inventory" className="flex flex-col gap-4" data-testid="inventory-section">
            <StockPosition query={inventory} />
            <StockBreakdowns query={inventory} />
          </section>
        )}

        {(canB2B || canStock) && (
          <div className={`grid grid-cols-1 gap-4 ${canB2B && canStock ? "xl:grid-cols-2" : ""}`}>
            {canB2B && <B2BPanel query={b2b} />}
            {canStock && <ActivityPanel query={activity} />}
          </div>
        )}
      </div>
    </>
  );
}
