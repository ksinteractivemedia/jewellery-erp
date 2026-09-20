import * as React from "react";
import { ShieldCheck, ShieldQuestion } from "lucide-react";
import { cn } from "../lib/utils";

export interface HUIDDisplayProps {
  huid?: string;
  hallmarkingStatus: "NOT_APPLICABLE" | "PENDING" | "HALLMARKED";
  className?: string;
}

/** Shows an item's HUID and hallmarking status — required wherever a physical piece is identified. */
export function HUIDDisplay({ huid, hallmarkingStatus, className }: HUIDDisplayProps) {
  if (hallmarkingStatus === "NOT_APPLICABLE") {
    return <span className={cn("text-body-sm text-muted", className)}>Not applicable</span>;
  }

  if (hallmarkingStatus === "PENDING" || !huid) {
    return (
      <span className={cn("inline-flex items-center gap-1.5 text-body-sm text-warning", className)}>
        <ShieldQuestion className="h-4 w-4" aria-hidden="true" />
        Hallmarking pending
      </span>
    );
  }

  return (
    <span className={cn("inline-flex items-center gap-1.5 text-body-sm text-foreground", className)}>
      <ShieldCheck className="h-4 w-4 text-success" aria-hidden="true" />
      <span className="tabular font-medium">{huid}</span>
    </span>
  );
}
