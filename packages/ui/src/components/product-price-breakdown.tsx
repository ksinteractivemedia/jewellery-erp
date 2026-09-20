import * as React from "react";
import { cn } from "../lib/utils";
import { formatCurrency } from "../lib/format";

export interface ProductPriceBreakdownProps {
  metalValue: number;
  makingCharge: number;
  stoneValue?: number;
  tax: number;
  total: number;
  className?: string;
}

/** Customer-facing "how this price is calculated" panel — no cost/margin, unlike the ERP PriceBreakdown. */
export function ProductPriceBreakdown({ metalValue, makingCharge, stoneValue, tax, total, className }: ProductPriceBreakdownProps) {
  const rows = [
    { label: "Metal value", amount: metalValue },
    { label: "Making charge", amount: makingCharge },
    ...(stoneValue ? [{ label: "Stone value", amount: stoneValue }] : []),
    { label: "GST", amount: tax },
  ];
  return (
    <div className={cn("flex flex-col gap-2 rounded-md border border-border-subtle bg-surface-sunken p-4", className)}>
      {rows.map((row) => (
        <div key={row.label} className="flex items-center justify-between text-body-sm text-muted">
          <span>{row.label}</span>
          <span className="tabular">{formatCurrency(row.amount)}</span>
        </div>
      ))}
      <div className="flex items-center justify-between border-t border-border-subtle pt-2 text-body font-medium text-foreground">
        <span>Total</span>
        <span className="tabular">{formatCurrency(total)}</span>
      </div>
    </div>
  );
}
