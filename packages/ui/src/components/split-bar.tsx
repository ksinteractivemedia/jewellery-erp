import * as React from "react";
import { cn } from "../lib/utils";

export interface SplitSegment {
  key: string;
  label: string;
  value: number;
  valueLabel: string;
  detail?: string;
  tone: "primary" | "info";
}

const FILL = { primary: "bg-primary", info: "bg-info" } as const;
const DOT = { primary: "bg-primary", info: "bg-info" } as const;

/** One bar cut into shares, with a legend that states each share as text. */
export function SplitBar({ segments, className }: { segments: SplitSegment[]; className?: string }) {
  const total = segments.reduce((t, s) => t + s.value, 0);
  const share = (v: number) => (total > 0 ? (v / total) * 100 : 0);
  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-surface-sunken" role="img" aria-label={segments.map((s) => `${s.label} ${share(s.value).toFixed(0)} percent`).join(", ")}>
        {segments.map((s) => (
          <div key={s.key} className={cn("h-full", FILL[s.tone])} style={{ width: `${share(s.value)}%` }} />
        ))}
      </div>
      <ul className="flex flex-col gap-2">
        {segments.map((s) => (
          <li key={s.key} className="flex items-start justify-between gap-3">
            <span className="flex items-start gap-2 text-body-sm">
              <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", DOT[s.tone])} aria-hidden="true" />
              <span className="flex flex-col"><span className="text-foreground">{s.label}</span>{s.detail && <span className="text-caption text-muted">{s.detail}</span>}</span>
            </span>
            <span className="flex flex-col items-end">
              <span className="tabular text-body-sm font-medium text-foreground">{s.valueLabel}</span>
              <span className="tabular text-caption text-muted">{total > 0 ? `${share(s.value).toFixed(0)}%` : "—"}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
