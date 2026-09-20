"use client";

import * as React from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import {
  addDays,
  addMonths,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "../lib/utils";

export interface DatePickerProps {
  value?: Date;
  onValueChange?: (date: Date | undefined) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  minDate?: Date;
  maxDate?: Date;
  "aria-label"?: string;
}

export function DatePicker({
  value,
  onValueChange,
  placeholder = "Pick a date",
  disabled,
  className,
  minDate,
  maxDate,
  "aria-label": ariaLabel,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false);
  const [month, setMonth] = React.useState(() => value ?? new Date());

  const weeks = React.useMemo(() => {
    const start = startOfWeek(startOfMonth(month));
    const end = endOfWeek(endOfMonth(month));
    const days: Date[] = [];
    let cursor = start;
    while (cursor <= end) {
      days.push(cursor);
      cursor = addDays(cursor, 1);
    }
    const result: Date[][] = [];
    for (let i = 0; i < days.length; i += 7) result.push(days.slice(i, i + 7));
    return result;
  }, [month]);

  const isDisabled = (day: Date) => (minDate && day < minDate) || (maxDate && day > maxDate);

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label={ariaLabel ?? placeholder}
          className={cn(
            "flex h-9 w-full items-center gap-2 rounded-md border border-border bg-surface px-3 text-body text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
            !value && "text-muted",
            className
          )}
        >
          <CalendarIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="truncate">{value ? format(value, "d MMM yyyy") : placeholder}</span>
        </button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="start"
          sideOffset={4}
          className="z-50 w-72 rounded-md border border-border bg-surface-elevated p-3 text-foreground shadow-lg animate-scale-in"
        >
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              aria-label="Previous month"
              onClick={() => setMonth((m) => subMonths(m, 1))}
              className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-surface-sunken"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-body-sm font-medium">{format(month, "MMMM yyyy")}</span>
            <button
              type="button"
              aria-label="Next month"
              onClick={() => setMonth((m) => addMonths(m, 1))}
              className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-surface-sunken"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <table className="w-full" role="grid">
            <thead>
              <tr>
                {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
                  <th key={i} scope="col" className="pb-1 text-caption font-normal text-muted">
                    {d}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {weeks.map((week, wi) => (
                <tr key={wi}>
                  {week.map((day) => {
                    const selected = value && isSameDay(day, value);
                    const outside = !isSameMonth(day, month);
                    const disabledDay = isDisabled(day);
                    return (
                      <td key={day.toISOString()} className="p-0.5 text-center">
                        <button
                          type="button"
                          disabled={disabledDay}
                          aria-pressed={!!selected}
                          onClick={() => {
                            onValueChange?.(day);
                            setOpen(false);
                          }}
                          className={cn(
                            "h-8 w-8 rounded-md text-body-sm transition-colors hover:bg-surface-sunken disabled:pointer-events-none disabled:opacity-30",
                            outside && "text-muted",
                            selected && "bg-primary text-primary-foreground hover:bg-primary-hover"
                          )}
                        >
                          {format(day, "d")}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
