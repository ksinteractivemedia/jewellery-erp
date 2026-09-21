"use client";

import * as React from "react";
import { cn } from "../lib/utils";

export interface TrendSeries {
  key: string;
  label: string;
  tone: "primary" | "info";
}
export interface TrendPoint {
  key: string;
  /** Full label for the tooltip and the accessible name, e.g. "Mon 14 Sep". */
  label: string;
  /** Short label for the x axis. */
  tick: string;
  /** One value per series, in series order. */
  values: number[];
}

const FILL = { primary: "bg-primary", info: "bg-info" } as const;

/** A "nice" axis maximum (1, 2, 2.5, 5 × 10ⁿ) at or above the tallest stack, so gridlines land on round numbers. */
export function niceCeiling(value: number): number {
  if (value <= 0) return 1;
  const exponent = Math.floor(Math.log10(value));
  const base = 10 ** exponent;
  const fraction = value / base;
  const step = [1, 2, 2.5, 5, 10].find((s) => fraction <= s)!;
  return step * base;
}

/**
 * Stacked columns over time. Built from plain HTML and CSS rather than a charting library: it stays crisp at
 * any width, needs no measuring, and every column is a focusable button whose accessible name carries the
 * exact figures — so the numbers are available to keyboard and screen-reader users, not only to a mouse.
 */
export function TrendChart({ points, series, formatValue, formatAxis, height = 200, className }: { points: TrendPoint[]; series: TrendSeries[]; formatValue: (v: number) => string; formatAxis?: (v: number) => string; height?: number; className?: string }) {
  const [active, setActive] = React.useState<number | null>(null);
  const totals = points.map((p) => p.values.reduce((t, v) => t + v, 0));
  const top = niceCeiling(Math.max(...totals, 0));
  const axis = formatAxis ?? formatValue;
  const every = Math.ceil(points.length / 8); // at most ~8 x-axis labels on a wide chart …
  const everyNarrow = Math.ceil(points.length / 4); // … and ~4 on a phone, where 8 would collide
  const activePoint = active === null ? null : points[active];

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="flex gap-3">
        <div className="flex shrink-0 flex-col justify-between text-right text-caption tabular text-muted" style={{ height }} aria-hidden="true">
          {[1, 0.75, 0.5, 0.25, 0].map((f) => <span key={f}>{f === 0 ? "0" : axis(top * f)}</span>)}
        </div>
        <div className="relative min-w-0 flex-1">
          <div className="pointer-events-none absolute inset-0 flex flex-col justify-between" style={{ height }} aria-hidden="true">
            {[0, 1, 2, 3, 4].map((i) => <div key={i} className="border-t border-border-subtle" />)}
          </div>
          <div className="relative flex items-end gap-[2px]" style={{ height }} onMouseLeave={() => setActive(null)}>
            {points.map((p, i) => (
              <button
                key={p.key}
                type="button"
                className={cn("group relative flex h-full min-w-0 flex-1 flex-col-reverse rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring", active === i && "bg-surface-sunken")}
                aria-label={`${p.label}: ${series.map((s, k) => `${s.label} ${formatValue(p.values[k] ?? 0)}`).join(", ")}`}
                onMouseEnter={() => setActive(i)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
              >
                {series.map((s, k) => {
                  const v = p.values[k] ?? 0;
                  return v > 0 ? <span key={s.key} className={cn("block w-full", FILL[s.tone], k === series.length - 1 && "rounded-t-sm")} style={{ height: `${(v / top) * 100}%` }} /> : null;
                })}
              </button>
            ))}
          </div>
          {activePoint && (
            <div className="pointer-events-none absolute top-1 z-10 rounded-md border border-border bg-surface-elevated px-3 py-2 text-body-sm shadow-md" style={{ left: `clamp(0px, calc(${((active! + 0.5) / points.length) * 100}% - 70px), calc(100% - 140px))` }} role="status">
              <div className="mb-1 font-medium text-foreground">{activePoint.label}</div>
              {series.map((s, k) => (
                <div key={s.key} className="flex items-center justify-between gap-4">
                  <span className="flex items-center gap-1.5 text-muted"><span className={cn("h-2 w-2 rounded-full", FILL[s.tone])} aria-hidden="true" />{s.label}</span>
                  <span className="tabular text-foreground">{formatValue(activePoint.values[k] ?? 0)}</span>
                </div>
              ))}
            </div>
          )}
          <div className="mt-1 flex gap-[2px]" aria-hidden="true">
            {points.map((p, i) => (
              <span key={p.key} className={cn("min-w-0 flex-1 overflow-visible whitespace-nowrap text-center text-caption text-muted", i % every !== 0 && "sm:opacity-0", i % everyNarrow !== 0 && "max-sm:opacity-0")}>{p.tick}</span>
            ))}
          </div>
        </div>
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 pl-1 text-caption text-muted" aria-label="Legend">
        {series.map((s) => <li key={s.key} className="flex items-center gap-1.5"><span className={cn("h-2 w-2 rounded-full", FILL[s.tone])} aria-hidden="true" />{s.label}</li>)}
      </ul>
    </div>
  );
}
