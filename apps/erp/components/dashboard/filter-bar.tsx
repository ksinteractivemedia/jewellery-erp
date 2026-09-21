"use client";

import * as React from "react";
import { RotateCcw } from "lucide-react";
import type { DashboardMeta } from "@jewellery/types";
import { Button, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Tabs, TabsList, TabsTrigger } from "@jewellery/ui";
import type { DashboardParams } from "../../lib/dashboard/params";
import { DEFAULT_PRESET, RANGE_PRESETS, formatRange, isValidCustomRange, type RangePreset, type ResolvedDashboardRange } from "../../lib/dashboard/range";

interface Props {
  meta: DashboardMeta;
  params: DashboardParams;
  /** The range actually applied (a bad custom range has already fallen back). */
  range: ResolvedDashboardRange;
  branchId?: string;
  locationId?: string;
  onChange: (patch: Partial<Record<keyof DashboardParams, string | undefined>>) => void;
  onReset: () => void;
}

const ALL = "all";

/**
 * Date range, branch and location. Everything lives in the URL (via `onChange`), so a filtered dashboard is a
 * link. Choosing a branch clears a location that isn't in it; choosing a location alone implies its branch.
 */
export function DashboardFilterBar({ meta, params, range, branchId, locationId, onChange, onReset }: Props) {
  const branch = meta.branches.find((b) => b.id === branchId);
  const locations = branch ? branch.locations.map((l) => ({ ...l, hint: undefined as string | undefined })) : meta.branches.flatMap((b) => b.locations.map((l) => ({ ...l, hint: meta.branches.length > 1 ? b.name : undefined })));
  const filtered = params.range !== DEFAULT_PRESET || Boolean(params.branch) || Boolean(params.location);

  // The custom inputs keep their own draft: a half-typed or briefly-inverted date must not be pushed into the URL
  // (which would collapse the range and remove the inputs mid-edit). Only a valid pair is committed.
  const customMode = params.range === "custom";
  const [draft, setDraft] = React.useState({ from: range.from, to: range.to });
  React.useEffect(() => setDraft({ from: range.from, to: range.to }), [range.from, range.to]);
  const draftValid = isValidCustomRange(draft.from, draft.to);
  const edit = (next: { from: string; to: string }) => {
    setDraft(next);
    if (isValidCustomRange(next.from, next.to)) onChange({ range: "custom", from: next.from, to: next.to });
  };

  const pickPreset = (preset: string) => {
    if (preset === "custom") onChange({ range: "custom", from: range.from, to: range.to });
    else onChange({ range: preset as RangePreset, from: undefined, to: undefined });
  };

  return (
    <div className="sticky -top-4 z-20 -mx-4 mb-4 border-b border-border-subtle bg-background/95 px-4 pb-3 pt-3 backdrop-blur md:-top-6 md:-mx-6 md:px-6" data-testid="dashboard-filters">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Tabs value={customMode ? "custom" : range.preset} onValueChange={pickPreset}>
          <TabsList aria-label="Date range" className="flex-wrap">
            {RANGE_PRESETS.map((p) => <TabsTrigger key={p.id} value={p.id} data-testid={`range-${p.id}`}>{p.label}</TabsTrigger>)}
          </TabsList>
        </Tabs>

        {customMode && (
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <Input type="date" aria-label="From date" value={draft.from} onChange={(e) => edit({ from: e.target.value, to: draft.to })} aria-invalid={!draftValid || undefined} className="h-9 w-40" data-testid="range-from" />
              <span className="text-muted" aria-hidden="true">–</span>
              <Input type="date" aria-label="To date" value={draft.to} onChange={(e) => edit({ from: draft.from, to: e.target.value })} aria-invalid={!draftValid || undefined} className="h-9 w-40" data-testid="range-to" />
            </div>
            {!draftValid && <p role="alert" className="text-caption text-danger" data-testid="range-error">Start must be on or before the end, and no more than a year apart.</p>}
          </div>
        )}

        <div className="flex flex-1 flex-wrap items-center gap-2 sm:justify-end">
          <Select value={branchId ?? ALL} onValueChange={(v) => onChange({ branch: v === ALL ? undefined : v, location: undefined })}>
            <SelectTrigger aria-label="Branch" className="w-full sm:w-44" data-testid="filter-branch"><SelectValue placeholder="All branches" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All branches</SelectItem>
              {meta.branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={locationId ?? ALL} onValueChange={(v) => onChange({ location: v === ALL ? undefined : v })}>
            <SelectTrigger aria-label="Location" className="w-full sm:w-52" data-testid="filter-location"><SelectValue placeholder="All locations" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{branch ? `All of ${branch.name}` : "All locations"}</SelectItem>
              {locations.map((l) => <SelectItem key={l.id} value={l.id}>{l.hint ? `${l.name} · ${l.hint}` : l.name}</SelectItem>)}
            </SelectContent>
          </Select>
          {filtered && <Button variant="ghost" size="sm" onClick={onReset} data-testid="filter-reset"><RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />Reset</Button>}
        </div>
      </div>
      <p className="mt-2 text-caption text-muted" data-testid="filter-summary">
        Sales and activity cover <span className="font-medium text-foreground">{formatRange(range.from, range.to)}</span>. Stock, queues and alerts show the current position — the date range doesn’t change them.
      </p>
    </div>
  );
}
