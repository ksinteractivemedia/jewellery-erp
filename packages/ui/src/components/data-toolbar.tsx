import * as React from "react";
import { cn } from "../lib/utils";

export interface DataToolbarProps {
  /** Search input / filter triggers, left-aligned. */
  left?: React.ReactNode;
  /** Primary actions (New, Export, view toggle), right-aligned. */
  right?: React.ReactNode;
  className?: string;
}

/** Standard toolbar sitting directly above a DataTable. */
export function DataToolbar({ left, right, className }: DataToolbarProps) {
  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-3 pb-3", className)}>
      <div className="flex flex-1 flex-wrap items-center gap-2">{left}</div>
      {right && <div className="flex items-center gap-2">{right}</div>}
    </div>
  );
}
