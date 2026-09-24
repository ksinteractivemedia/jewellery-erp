"use client";
import * as React from "react";
import { X } from "lucide-react";
import { cn } from "../lib/utils";
import { Button } from "./button";

export interface BulkActionBarProps {
  selectedCount: number;
  onClear: () => void;
  actions: React.ReactNode;
  className?: string;
}

/** Floating bar that appears when rows are selected in a DataTable. */
export function BulkActionBar({ selectedCount, onClear, actions, className }: BulkActionBarProps) {
  if (selectedCount === 0) return null;

  return (
    <div
      role="toolbar"
      aria-label="Bulk actions"
      className={cn(
        "fixed bottom-4 left-1/2 z-40 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 flex-wrap items-center gap-3 rounded-lg border border-border bg-surface-elevated px-4 py-2.5 shadow-lg animate-scale-in md:left-auto md:right-6 md:max-w-[calc(100vw-3rem)] md:translate-x-0",
        className
      )}
    >
      <button
        type="button"
        onClick={onClear}
        aria-label="Clear selection"
        className="flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-surface-sunken hover:text-foreground"
      >
        <X className="h-3.5 w-3.5" />
      </button>
      <span className="text-body-sm font-medium text-foreground">{selectedCount} selected</span>
      <div className="flex flex-wrap items-center gap-2">{actions}</div>
    </div>
  );
}
