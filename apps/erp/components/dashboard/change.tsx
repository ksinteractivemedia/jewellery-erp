import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import type { Change } from "../../lib/dashboard/format";

/** How a figure moved against the previous period. Colour follows direction only — the caller decides whether it is shown at all. */
export function ChangeBadge({ change, suffix = " vs previous period" }: { change: Change; suffix?: string }) {
  const Icon = change.direction === "up" ? ArrowUpRight : change.direction === "down" ? ArrowDownRight : Minus;
  const tone = change.direction === "up" ? "text-success" : change.direction === "down" ? "text-danger" : "text-muted";
  return (
    <span className={`inline-flex items-center gap-0.5 text-caption font-medium ${tone}`} data-testid="change">
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {change.label}
      {change.direction !== "flat" && <span className="font-normal text-muted">{suffix}</span>}
    </span>
  );
}
