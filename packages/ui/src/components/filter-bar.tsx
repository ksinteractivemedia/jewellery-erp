import * as React from "react";
import { X } from "lucide-react";
import { cn } from "../lib/utils";
import { Button } from "./button";

export interface FilterChip {
  id: string;
  label: string;
}

export interface FilterBarProps {
  /** Filter controls (Select/Combobox/DatePicker instances) rendered inline. */
  controls?: React.ReactNode;
  activeFilters?: FilterChip[];
  onRemoveFilter?: (id: string) => void;
  onClearAll?: () => void;
  className?: string;
}

/** Row of filter controls above a list/table, with removable chips for active filters. */
export function FilterBar({ controls, activeFilters = [], onRemoveFilter, onClearAll, className }: FilterBarProps) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {controls && <div className="flex flex-wrap items-center gap-2">{controls}</div>}
      {activeFilters.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {activeFilters.map((filter) => (
            <span
              key={filter.id}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-sunken px-2 py-0.5 text-caption text-foreground"
            >
              {filter.label}
              {onRemoveFilter && (
                <button
                  type="button"
                  aria-label={`Remove filter ${filter.label}`}
                  onClick={() => onRemoveFilter(filter.id)}
                  className="rounded-full hover:text-danger"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </span>
          ))}
          {onClearAll && (
            <Button variant="link" size="sm" onClick={onClearAll} className="text-caption">
              Clear all
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
