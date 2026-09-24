"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, Download } from "lucide-react";
import type { ReportKey } from "@jewellery/types";
import { Alert, Button, DataTable, EmptyState, FilterBar, Input, MetricCard, PageHeader, Pagination, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Skeleton } from "@jewellery/ui";
import { useDashboardMeta } from "../../lib/api/dashboard-queries";
import { errorMessage, useCategories } from "../../lib/api/queries";
import { reportsApi, useReport, useReportRegistry, type ReportQuery } from "../../lib/api/reports";
import { formatReportValue } from "./format";

const ALL = "all";
const PAGE_SIZE = 25;

export function ReportView({ reportKey }: { reportKey: string }) {
  const registry = useReportRegistry();
  const def = registry.data?.find((r) => r.key === reportKey);

  const meta = useDashboardMeta();
  const categories = useCategories();

  const [filters, setFilters] = React.useState<ReportQuery>({});
  const [page, setPage] = React.useState(1);
  const patch = (p: Partial<ReportQuery>) => {
    setFilters((f) => ({ ...f, ...p }));
    setPage(1);
  };

  const query: ReportQuery = { ...filters, page, pageSize: PAGE_SIZE };
  const report = useReport(reportKey as ReportKey, query);
  const [downloading, setDownloading] = React.useState(false);

  if (registry.isLoading) return <Skeleton className="h-64" />;
  if (!def) {
    return (
      <div className="flex flex-col gap-4">
        <PageHeader title="Report not found" />
        <Alert variant="danger" title="No such report">This report doesn&apos;t exist. <Link href="/reports" className="underline">Back to reports</Link></Alert>
      </div>
    );
  }

  const branch = meta.data?.branches.find((b) => b.id === filters.branchId);
  const locations = branch ? branch.locations : (meta.data?.branches.flatMap((b) => b.locations) ?? []);
  const pageCount = report.data ? Math.max(1, Math.ceil(report.data.total / PAGE_SIZE)) : 1;

  const download = async () => {
    setDownloading(true);
    try {
      await reportsApi.download(reportKey as ReportKey, filters, def.title);
    } catch (e) {
      // Reuses the same toast the rest of the app uses for a failed mutation.
      const { toast } = await import("@jewellery/ui");
      toast({ title: "Couldn't export this report", description: errorMessage(e), variant: "danger" });
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={def.title}
        description={def.description}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" asChild>
              <Link href="/reports"><ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />Reports</Link>
            </Button>
            <Button variant="secondary" size="sm" onClick={download} disabled={downloading} data-testid="export-csv">
              <Download className="h-3.5 w-3.5" aria-hidden="true" />{downloading ? "Exporting…" : "Export CSV"}
            </Button>
          </div>
        }
      />

      <FilterBar
        controls={
          <>
            {def.filters.includes("dateRange") && (
              <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
                <Input type="date" aria-label="From date" value={filters.from ?? ""} onChange={(e) => patch({ from: e.target.value || undefined })} className="h-9 w-full sm:w-40" />
                <span className="text-muted" aria-hidden="true">–</span>
                <Input type="date" aria-label="To date" value={filters.to ?? ""} onChange={(e) => patch({ to: e.target.value || undefined })} className="h-9 w-full sm:w-40" />
              </div>
            )}
            {def.filters.includes("branch") && (
              <Select value={filters.branchId ?? ALL} onValueChange={(v) => patch({ branchId: v === ALL ? undefined : v, locationId: undefined })}>
                <SelectTrigger aria-label="Branch" className="w-full sm:w-44"><SelectValue placeholder="All branches" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All branches</SelectItem>
                  {(meta.data?.branches ?? []).map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            {def.filters.includes("location") && (
              <Select value={filters.locationId ?? ALL} onValueChange={(v) => patch({ locationId: v === ALL ? undefined : v })}>
                <SelectTrigger aria-label="Location" className="w-full sm:w-48"><SelectValue placeholder="All locations" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All locations</SelectItem>
                  {locations.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            {def.filters.includes("customerType") && (
              <Select value={filters.customerType ?? ALL} onValueChange={(v) => patch({ customerType: v === ALL ? undefined : (v as "B2C" | "B2B") })}>
                <SelectTrigger aria-label="Customer type" className="w-full sm:w-36"><SelectValue placeholder="All types" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All types</SelectItem>
                  <SelectItem value="B2C">B2C</SelectItem>
                  <SelectItem value="B2B">B2B</SelectItem>
                </SelectContent>
              </Select>
            )}
            {def.filters.includes("category") && (
              <Select value={filters.categoryId ?? ALL} onValueChange={(v) => patch({ categoryId: v === ALL ? undefined : v })}>
                <SelectTrigger aria-label="Category" className="w-full sm:w-48"><SelectValue placeholder="All categories" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All categories</SelectItem>
                  {(categories.data ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            {def.filters.includes("groupBy") && def.groupByOptions && (
              <Select value={filters.groupBy ?? def.groupByOptions[0]!.value} onValueChange={(v) => patch({ groupBy: v })}>
                <SelectTrigger aria-label="Group by" className="w-full sm:w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {def.groupByOptions.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
          </>
        }
      />

      {report.isLoading && <div className="flex flex-col gap-2">{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-10" />)}</div>}
      {report.isError && (
        <Alert variant="danger" title="Couldn't load this report">
          {errorMessage(report.error)} <button className="underline" onClick={() => report.refetch()}>Retry</button>
        </Alert>
      )}

      {report.data && (
        <>
          {report.data.summary.length > 0 && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {report.data.summary.map((s) => <MetricCard key={s.label} label={s.label} value={formatReportValue(s.value, s.format)} />)}
            </div>
          )}

          {report.data.rows.length === 0 ? (
            <EmptyState title="Nothing to show" description="No data matches the current filters." />
          ) : (
            <DataTable
              data={report.data.rows.map((row, i) => ({ ...row, __rowId: i }))}
              getRowId={(r) => String((r as { __rowId: number }).__rowId)}
              columns={def.columns.map((c) => ({
                id: c.key,
                header: c.label,
                align: c.align,
                cell: (row: Record<string, unknown>) => formatReportValue(row[c.key], c.format),
              }))}
            />
          )}

          {report.data.total > PAGE_SIZE && <Pagination page={page} pageCount={pageCount} onPageChange={setPage} summary={`${report.data.total} rows`} />}
        </>
      )}
    </div>
  );
}
