import * as React from "react";
import { cn } from "../lib/utils";
import { formatCurrency } from "../lib/format";

export interface PriceBreakdownRow {
  label: string;
  amount: number;
  /** Rendered as a subtraction (e.g. discount). */
  negative?: boolean;
  muted?: boolean;
}

export interface PriceBreakdownProps {
  rows: PriceBreakdownRow[];
  total: number;
  className?: string;
}

/**
 * Renders a resolved PriceSnapshot: metal value, making charge, wastage, stone value,
 * discount, tax lines, and the final total. The numbers themselves always come from the
 * shared pricing engine — this component only displays them.
 */
export function PriceBreakdown({ rows, total, className }: PriceBreakdownProps) {
  return (
    <div className={cn("flex flex-col gap-2 rounded-md border border-border bg-surface p-4", className)}>
      {rows.map((row) => (
        <div key={row.label} className="flex items-center justify-between text-body-sm">
          <span className={row.muted ? "text-muted" : "text-foreground"}>{row.label}</span>
          <span className={cn("tabular", row.negative ? "text-success" : "text-foreground")}>
            {row.negative ? "− " : ""}
            {formatCurrency(Math.abs(row.amount), { precise: true })}
          </span>
        </div>
      ))}
      <div className="flex items-center justify-between border-t border-border-subtle pt-2 text-body font-medium">
        <span className="text-foreground">Total</span>
        <span className="tabular text-foreground">{formatCurrency(total, { precise: true })}</span>
      </div>
    </div>
  );
}
