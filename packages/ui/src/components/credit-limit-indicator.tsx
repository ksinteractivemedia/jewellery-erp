import * as React from "react";
import { cn } from "../lib/utils";
import { formatCurrency } from "../lib/format";

export interface CreditLimitIndicatorProps {
  creditLimit: number;
  outstanding: number;
  overdueAmount?: number;
  className?: string;
}

/** B2B credit-account visualization: used-vs-available credit, with an overdue callout. See business-rules.md §4. */
export function CreditLimitIndicator({ creditLimit, outstanding, overdueAmount = 0, className }: CreditLimitIndicatorProps) {
  const used = Math.min(outstanding / Math.max(creditLimit, 1), 1);
  const available = Math.max(creditLimit - outstanding, 0);
  const nearLimit = used >= 0.85;

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className="flex items-baseline justify-between text-body-sm">
        <span className="text-muted">Outstanding</span>
        <span className="tabular font-medium text-foreground">{formatCurrency(outstanding)}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken">
        <div
          className={cn("h-full rounded-full transition-all", nearLimit ? "bg-danger" : "bg-primary")}
          style={{ width: `${used * 100}%` }}
        />
      </div>
      <div className="flex items-baseline justify-between text-caption text-muted">
        <span>Available: {formatCurrency(available)}</span>
        <span>Limit: {formatCurrency(creditLimit)}</span>
      </div>
      {overdueAmount > 0 && (
        <span className="text-caption font-medium text-danger">{formatCurrency(overdueAmount)} overdue</span>
      )}
    </div>
  );
}
