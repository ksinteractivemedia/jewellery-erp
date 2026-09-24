"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { ReportCategory } from "@jewellery/types";
import { Alert, Card, PageHeader, Skeleton } from "@jewellery/ui";
import { errorMessage } from "../../lib/api/queries";
import { useReportRegistry } from "../../lib/api/reports";

const CATEGORY_LABELS: Record<ReportCategory, string> = {
  SALES: "Sales",
  INVENTORY: "Inventory",
  GOLD: "Gold",
  B2B: "B2B",
  PROFITABILITY: "Profitability",
};
const CATEGORY_ORDER: ReportCategory[] = ["SALES", "INVENTORY", "GOLD", "B2B", "PROFITABILITY"];

/** One registry-driven index, grouped by category — adding a report anywhere in the backend registry shows up here for free, never a hand-maintained list. */
export function ReportIndexView() {
  const registry = useReportRegistry();

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Reports" description="Sales, inventory, gold, B2B and profitability — every report reads live from the backend; nothing here is computed in the browser." />

      {registry.isLoading && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
      )}
      {registry.isError && (
        <Alert variant="danger" title="Couldn't load the report list">
          {errorMessage(registry.error)} <button className="underline" onClick={() => registry.refetch()}>Retry</button>
        </Alert>
      )}

      {registry.data &&
        CATEGORY_ORDER.map((category) => {
          const items = registry.data!.filter((r) => r.category === category);
          if (items.length === 0) return null;
          return (
            <div key={category} className="flex flex-col gap-2">
              <h3 className="text-h4 font-semibold">{CATEGORY_LABELS[category]}</h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((r) => (
                  <Link key={r.key} href={`/reports/${r.key}`} data-testid="report-card">
                    <Card className="flex h-full flex-col gap-1 p-4 transition-colors hover:border-foreground">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-foreground">{r.title}</span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
                      </div>
                      <p className="text-body-sm text-muted">{r.description}</p>
                    </Card>
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
    </div>
  );
}
