import * as React from "react";
import { cn } from "../lib/utils";
import { formatWeight } from "../lib/format";

export interface WeightDisplayProps {
  grams: number;
  label?: string;
  unit?: "g" | "ct";
  precision?: number;
  className?: string;
}

/** Renders a single weight value (gross/stone/net/fine) with tabular alignment for table cells. */
export function WeightDisplay({ grams, label, unit, precision, className }: WeightDisplayProps) {
  return (
    <span className={cn("tabular inline-flex items-baseline gap-1 text-body-sm text-foreground", className)}>
      {label && <span className="text-caption text-muted">{label}</span>}
      {formatWeight(grams, { unit, precision })}
    </span>
  );
}

export interface WeightBreakdownProps {
  gross: number;
  stone: number;
  netMetal: number;
  fineMetal: number;
  className?: string;
}

/** The four weight figures that define a physical InventoryItem, shown together (product detail, GRN, job work). */
export function WeightBreakdown({ gross, stone, netMetal, fineMetal, className }: WeightBreakdownProps) {
  const rows: { label: string; value: number }[] = [
    { label: "Gross weight", value: gross },
    { label: "Stone weight", value: stone },
    { label: "Net metal weight", value: netMetal },
    { label: "Fine metal weight", value: fineMetal },
  ];
  return (
    <dl className={cn("grid grid-cols-2 gap-y-1.5 text-body-sm", className)}>
      {rows.map((row) => (
        <div key={row.label} className="contents">
          <dt className="text-muted">{row.label}</dt>
          <dd className="tabular text-right font-medium text-foreground">{formatWeight(row.value)}</dd>
        </div>
      ))}
    </dl>
  );
}
