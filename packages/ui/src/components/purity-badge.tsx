import * as React from "react";
import { cn } from "../lib/utils";

export interface PurityBadgeProps {
  /** e.g. "22K", "18K", "925", "PT950" */
  purity: string;
  metalType?: "GOLD" | "SILVER" | "PLATINUM";
  className?: string;
}

/** Small tag for metal purity — appears on product cards, inventory rows and price breakdowns. */
export function PurityBadge({ purity, metalType, className }: PurityBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border border-border-subtle bg-surface-sunken px-2 py-0.5 text-caption font-medium text-foreground",
        className
      )}
      title={metalType}
    >
      {purity}
    </span>
  );
}
