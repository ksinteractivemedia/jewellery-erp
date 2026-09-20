import * as React from "react";
import { cn } from "../lib/utils";

export interface ProductGridProps {
  children: React.ReactNode;
  className?: string;
}

/** Responsive grid: 2 columns on mobile, up to 4 on desktop. */
export function ProductGrid({ children, className }: ProductGridProps) {
  return (
    <div className={cn("grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-6 lg:grid-cols-4", className)}>{children}</div>
  );
}
