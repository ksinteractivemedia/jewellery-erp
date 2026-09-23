"use client";

import type { ReactNode } from "react";
import { PageHeader } from "@jewellery/ui";
import { useHallmarkingDashboard } from "../../lib/api/hallmarking";
import { Load } from "./shared";
import { HallmarkingBatchesView } from "./batches-view";

function Stat({ label, value, tone }: { label: string; value: ReactNode; tone?: "danger" | "warning" }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <p className="text-body-sm text-muted">{label}</p>
      <p className={`mt-1 text-h3 font-display tabular ${tone === "danger" ? "text-danger" : tone === "warning" ? "text-warning" : "text-foreground"}`} data-testid={`stat-${label}`}>{value}</p>
    </div>
  );
}

/**
 * The screen the spec calls "Hallmarking Dashboard": counts by where each piece currently stands —
 * Pending / In Transit / At Centre / Received / Verified / Failed — with the working list of batches,
 * filterable by the same stages, directly below.
 */
export function HallmarkingDashboardView() {
  const q = useHallmarkingDashboard();
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Hallmarking" description="Send pieces for BIS hallmarking, track them at the centre, and record what comes back." />
      <Load q={q} rows={3}>
        {q.data && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Stat label="Pending" value={q.data.counts.pending} />
            <Stat label="In Transit" value={q.data.counts.inTransit} />
            <Stat label="At Centre" value={q.data.counts.atCentre} />
            <Stat label="Received" value={q.data.counts.received} tone={q.data.counts.received ? "warning" : undefined} />
            <Stat label="Verified" value={q.data.counts.verified} />
            <Stat label="Failed" value={q.data.counts.failed} tone={q.data.counts.failed ? "danger" : undefined} />
          </div>
        )}
      </Load>
      <HallmarkingBatchesView />
    </div>
  );
}
