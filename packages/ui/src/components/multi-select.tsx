"use client";

import * as React from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { Command as CommandPrimitive } from "cmdk";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "../lib/utils";
import type { ComboboxOption } from "./combobox";

export interface MultiSelectProps {
  options: ComboboxOption[];
  value: string[];
  onValueChange: (value: string[]) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
}

/** Searchable multi-select (Combobox is single-value). Stays open while picking; the trigger summarises the selection. */
export function MultiSelect({
  options,
  value,
  onValueChange,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  emptyMessage = "No results found.",
  disabled,
  className,
  "aria-label": ariaLabel,
}: MultiSelectProps) {
  const [open, setOpen] = React.useState(false);
  const selected = options.filter((o) => value.includes(o.value));
  const summary = selected.length === 0 ? placeholder : selected.length <= 2 ? selected.map((o) => o.label).join(", ") : `${selected.length} selected`;

  const toggle = (v: string) => onValueChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label={ariaLabel}
          aria-expanded={open}
          className={cn(
            "flex h-9 w-full items-center justify-between gap-2 rounded-md border border-border bg-surface px-3 text-body text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
            selected.length === 0 && "text-muted",
            className
          )}
        >
          <span className="truncate">{summary}</span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
        </button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="start"
          sideOffset={4}
          className="z-50 w-[var(--radix-popover-trigger-width)] min-w-[12rem] overflow-hidden rounded-md border border-border bg-surface-elevated text-foreground shadow-lg animate-scale-in"
        >
          <CommandPrimitive className="flex flex-col">
            <CommandPrimitive.Input placeholder={searchPlaceholder} className="h-9 w-full border-b border-border bg-transparent px-3 text-body-sm outline-none placeholder:text-muted" />
            <CommandPrimitive.List className="max-h-64 overflow-y-auto p-1">
              <CommandPrimitive.Empty className="py-6 text-center text-body-sm text-muted">{emptyMessage}</CommandPrimitive.Empty>
              {options.map((option) => (
                <CommandPrimitive.Item
                  key={option.value}
                  value={option.label}
                  onSelect={() => toggle(option.value)}
                  className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-body-sm data-[selected=true]:bg-surface-sunken"
                >
                  <Check className={cn("h-4 w-4 text-primary", value.includes(option.value) ? "opacity-100" : "opacity-0")} aria-hidden="true" />
                  <span className="flex flex-col">
                    <span>{option.label}</span>
                    {option.description && <span className="text-caption text-muted">{option.description}</span>}
                  </span>
                </CommandPrimitive.Item>
              ))}
            </CommandPrimitive.List>
          </CommandPrimitive>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
