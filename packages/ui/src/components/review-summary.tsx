import * as React from "react";
import { Star } from "lucide-react";
import { cn } from "../lib/utils";

export interface ReviewSummaryProps {
  average: number;
  count: number;
  className?: string;
}

export function ReviewSummary({ average, count, className }: ReviewSummaryProps) {
  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <div className="flex items-center" aria-hidden="true">
        {Array.from({ length: 5 }).map((_, i) => (
          <Star
            key={i}
            className={cn("h-3.5 w-3.5", i < Math.round(average) ? "fill-primary text-primary" : "text-border")}
          />
        ))}
      </div>
      <span className="text-body-sm text-muted">
        {average.toFixed(1)} ({count} review{count === 1 ? "" : "s"})
      </span>
    </div>
  );
}
