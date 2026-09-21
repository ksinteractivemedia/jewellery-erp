import * as React from "react";
import { cn } from "../lib/utils";

export interface BarListItem {
  key: string;
  label: string;
  /** Small second line under the label. */
  sublabel?: string;
  /** Sets the bar's length, relative to the largest value in the list. */
  value: number;
  /** What is printed at the right — the number itself always appears as text, the bar only adds shape. */
  valueLabel: string;
  /** Small second line under the value. */
  secondary?: string;
}

const TONES = { primary: "bg-primary", info: "bg-info", neutral: "bg-foreground/70" } as const;

/**
 * Ranked horizontal bars with the figures printed beside them — for "top products", "stock by location" and
 * the like. Presentational and server-safe. A list, not an image, so a screen reader hears every row.
 */
export function BarList({ items, tone = "info", className, ...props }: { items: BarListItem[]; tone?: keyof typeof TONES; className?: string } & React.AriaAttributes) {
  const max = Math.max(...items.map((i) => i.value), 0);
  return (
    <ul className={cn("flex flex-col gap-3", className)} {...props}>
      {items.map((item) => (
        <li key={item.key} className="flex flex-col gap-1">
          <div className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate text-body-sm text-foreground" title={item.label}>{item.label}</span>
            <span className="tabular shrink-0 text-body-sm font-medium text-foreground">{item.valueLabel}</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken" aria-hidden="true">
            <div className={cn("h-full rounded-full", TONES[tone])} style={{ width: `${max > 0 ? Math.max((item.value / max) * 100, item.value > 0 ? 2 : 0) : 0}%` }} />
          </div>
          {(item.sublabel || item.secondary) && (
            <div className="flex justify-between gap-3 text-caption text-muted">
              <span className="min-w-0 truncate">{item.sublabel}</span>
              <span className="shrink-0">{item.secondary}</span>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
