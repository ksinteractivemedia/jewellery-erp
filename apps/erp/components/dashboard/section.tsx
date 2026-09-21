"use client";

import * as React from "react";
import type { UseQueryResult } from "@tanstack/react-query";
import { PlugZap } from "lucide-react";
import type { DashboardSection } from "@jewellery/types";
import { Alert, Badge, Button, Card, EmptyState } from "@jewellery/ui";
import { errorMessage } from "../../lib/api/queries";
import { formatRange } from "../../lib/dashboard/range";

export type OkSection<T> = Extract<DashboardSection<T>, { status: "OK" }>;

/** Marks figures that came from a development adapter. Never shown in production, where no adapter is registered. */
export function SampleBadge({ className, compact }: { className?: string; compact?: boolean }) {
  const title = "Supplied by a development adapter, not by real orders or invoices";
  // On a dense tile a full pill would out-shout the figure; the banner and section headers carry the full label.
  if (compact) return <span className={`rounded border border-warning/40 px-1 text-[10px] font-medium uppercase tracking-wide text-warning ${className ?? ""}`} title={title} data-testid="sample-badge">Sample</span>;
  return <Badge variant="warning" className={className} title={title} data-testid="sample-badge">Sample data</Badge>;
}

/** What a section is looking at: a date range, or "now" for a snapshot the range cannot change. */
export function scopeCaption(scope: OkSection<unknown>["scope"]): string {
  return scope.range ? formatRange(scope.range.from, scope.range.to) : "Current position";
}

/** The state of a section whose module does not exist yet: named, explained, and never a zero. */
export function NotConnected({ requires, explanation, compact }: { requires: string; explanation: string; compact?: boolean }) {
  return (
    <div data-testid="not-connected">
      <EmptyState icon={<PlugZap className="h-7 w-7" aria-hidden="true" />} title={`Not connected yet — needs the ${requires}`} description={explanation} className={compact ? "py-6" : "py-8"} />
    </div>
  );
}

/**
 * One dashboard section: a card with a title, the honest caption of what it covers, a SAMPLE badge when its
 * figures are sample data, and — inside — exactly one of: skeleton while loading, an error with retry, the
 * "not connected" state, or the content. Changing a filter keeps the old figures on screen, dimmed, until the
 * new ones arrive.
 */
export function Section<T>({
  title,
  description,
  query,
  skeleton,
  children,
  className,
  actions,
  testId,
  showScope = true,
}: {
  title: string;
  description?: string;
  query: UseQueryResult<DashboardSection<T>>;
  skeleton: React.ReactNode;
  children: (data: T, section: OkSection<T>) => React.ReactNode;
  className?: string;
  actions?: React.ReactNode;
  testId?: string;
  /** Whether to print what the section covers (range or "current position") under its title. Compact cards inside a labelled group turn it off. */
  showScope?: boolean;
}) {
  const section = query.data;
  const ok = section?.status === "OK" ? section : undefined;
  return (
    <Card className={`flex flex-col gap-4 p-5 ${className ?? ""}`} data-testid={testId} aria-busy={query.isFetching || undefined}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 className="text-body font-medium text-foreground">{title}</h2>
          {(description || (ok && showScope)) && <p className="text-caption text-muted">{[description, ok && showScope && scopeCaption(ok.scope)].filter(Boolean).join(" · ")}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {ok?.provenance === "SAMPLE" && <SampleBadge />}
          {actions}
        </div>
      </div>
      {query.isPending ? (
        skeleton
      ) : query.isError && !section ? (
        <Alert variant="danger" title="Couldn't load this section" data-testid="section-error">
          <div className="flex flex-col items-start gap-2">
            <span>{errorMessage(query.error)}</span>
            <Button size="sm" variant="secondary" onClick={() => query.refetch()}>Retry</Button>
          </div>
        </Alert>
      ) : section?.status === "NOT_CONNECTED" ? (
        <NotConnected requires={section.requires} explanation={section.explanation} compact />
      ) : ok ? (
        <div className={query.isPlaceholderData ? "opacity-60 transition-opacity" : "transition-opacity"}>{children(ok.data, ok)}</div>
      ) : (
        skeleton
      )}
    </Card>
  );
}
