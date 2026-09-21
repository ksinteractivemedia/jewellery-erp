import * as React from "react";
import { cn } from "../lib/utils";

/** A bounded gauge (credit used of limit). It turns red only when the value goes past its maximum — a fact, not a threshold we invented. */
export function Meter({ value, max = 100, label, className }: { value: number; max?: number; label: string; className?: string }) {
  const over = value > max;
  return (
    <div className={cn("h-2 w-full overflow-hidden rounded-full bg-surface-sunken", className)} role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={Math.min(value, max)}>
      <div className={cn("h-full rounded-full", over ? "bg-danger" : "bg-info")} style={{ width: `${max > 0 ? Math.min((value / max) * 100, 100) : 0}%` }} />
    </div>
  );
}
