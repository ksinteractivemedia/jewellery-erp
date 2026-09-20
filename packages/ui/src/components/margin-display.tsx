import * as React from "react";
import { cn } from "../lib/utils";
import { formatCurrency, formatPercentage } from "../lib/format";

export interface MarginDisplayProps {
  cost: number;
  sellingPrice: number;
  className?: string;
}

/** ERP-only (never shown to customers): margin in rupees and percent, derived from cost vs. selling price. */
export function MarginDisplay({ cost, sellingPrice, className }: MarginDisplayProps) {
  const margin = sellingPrice - cost;
  const marginPercent = sellingPrice > 0 ? (margin / sellingPrice) * 100 : 0;
  const positive = margin >= 0;

  return (
    <div className={cn("flex items-baseline gap-2", className)}>
      <span className={cn("tabular text-body-sm font-medium", positive ? "text-success" : "text-danger")}>
        {formatCurrency(margin, { precise: true })}
      </span>
      <span className={cn("tabular text-caption", positive ? "text-success" : "text-danger")}>
        ({formatPercentage(marginPercent)})
      </span>
    </div>
  );
}
