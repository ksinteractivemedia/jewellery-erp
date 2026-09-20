import * as React from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { cn } from "../lib/utils";
import { Card } from "./card";

export interface MetricCardProps {
  label: string;
  value: string;
  change?: { value: string; direction: "up" | "down"; tone?: "positive" | "negative" };
  icon?: React.ReactNode;
  className?: string;
}

export function MetricCard({ label, value, change, icon, className }: MetricCardProps) {
  const changeTone = change?.tone ?? (change?.direction === "up" ? "positive" : "negative");
  return (
    <Card className={cn("flex flex-col gap-2 p-4", className)}>
      <div className="flex items-center justify-between">
        <span className="text-body-sm text-muted">{label}</span>
        {icon && <span className="text-muted">{icon}</span>}
      </div>
      <span className="text-h2 tabular font-display text-foreground">{value}</span>
      {change && (
        <span
          className={cn(
            "inline-flex items-center gap-1 text-body-sm font-medium",
            changeTone === "positive" ? "text-success" : "text-danger"
          )}
        >
          {change.direction === "up" ? (
            <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <ArrowDownRight className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          {change.value}
        </span>
      )}
    </Card>
  );
}
