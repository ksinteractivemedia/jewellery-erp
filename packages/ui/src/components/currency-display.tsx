import * as React from "react";
import { cn } from "../lib/utils";
import { formatCurrency } from "../lib/format";

export interface CurrencyDisplayProps {
  /** Amount in whole rupees. */
  amount: number;
  precise?: boolean;
  size?: "sm" | "md" | "lg";
  tone?: "default" | "muted" | "success" | "danger";
  className?: string;
}

const sizeClass = { sm: "text-body-sm", md: "text-body", lg: "text-h4" };
const toneClass = { default: "text-foreground", muted: "text-muted", success: "text-success", danger: "text-danger" };

/** Consistent rupee formatting everywhere a price/amount is shown. Never format currency inline in a component. */
export function CurrencyDisplay({ amount, precise, size = "md", tone = "default", className }: CurrencyDisplayProps) {
  return (
    <span className={cn("tabular font-medium", sizeClass[size], toneClass[tone], className)}>
      {formatCurrency(amount, { precise })}
    </span>
  );
}
