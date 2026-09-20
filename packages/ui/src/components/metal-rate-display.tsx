import * as React from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { cn } from "../lib/utils";
import { formatCurrency } from "../lib/format";

export type MetalType = "GOLD" | "SILVER" | "PLATINUM";

const metalLabel: Record<MetalType, string> = {
  GOLD: "Gold",
  SILVER: "Silver",
  PLATINUM: "Platinum",
};

const metalDot: Record<MetalType, string> = {
  GOLD: "bg-primary",
  SILVER: "bg-muted",
  PLATINUM: "bg-info",
};

export interface MetalRateDisplayProps {
  metalType: MetalType;
  purity: string;
  ratePerGram: number;
  asOf?: string;
  change?: { percent: number; direction: "up" | "down" };
  className?: string;
}

/** Live/quoted metal rate — used on catalogue, checkout and ERP pricing screens. Never computes price itself. */
export function MetalRateDisplay({ metalType, purity, ratePerGram, asOf, change, className }: MetalRateDisplayProps) {
  return (
    <div className={cn("flex items-center gap-3 rounded-md border border-border bg-surface px-3 py-2", className)}>
      <span className={cn("h-2 w-2 rounded-full", metalDot[metalType])} aria-hidden="true" />
      <div className="flex flex-col">
        <span className="text-body-sm font-medium text-foreground">
          {metalLabel[metalType]} · {purity}
        </span>
        {asOf && <span className="text-caption text-muted">as of {asOf}</span>}
      </div>
      <div className="ml-auto flex flex-col items-end">
        <span className="tabular text-body font-medium text-foreground">{formatCurrency(ratePerGram, { precise: true })}/g</span>
        {change && (
          <span className={cn("inline-flex items-center gap-0.5 text-caption", change.direction === "up" ? "text-success" : "text-danger")}>
            {change.direction === "up" ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
            {change.percent.toFixed(2)}%
          </span>
        )}
      </div>
    </div>
  );
}
