import * as React from "react";
import { cn } from "../lib/utils";

export type StatusTone = "neutral" | "primary" | "success" | "warning" | "danger" | "info";

const toneDot: Record<StatusTone, string> = {
  neutral: "bg-muted",
  primary: "bg-primary",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  info: "bg-info",
};

const toneText: Record<StatusTone, string> = {
  neutral: "text-foreground",
  primary: "text-primary-active",
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
  info: "text-info",
};

export interface StatusBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: StatusTone;
  label: string;
}

/** Generic dot-and-label status indicator. Domain badges (InventoryStatusBadge, OrderStatusBadge) map their enum to a tone and render this. */
export function StatusBadge({ tone = "neutral", label, className, ...props }: StatusBadgeProps) {
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 text-body-sm font-medium", toneText[tone], className)}
      {...props}
    >
      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", toneDot[tone])} aria-hidden="true" />
      {label}
    </span>
  );
}
