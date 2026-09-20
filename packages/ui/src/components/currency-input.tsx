"use client";

import * as React from "react";
import { cn } from "../lib/utils";

export interface CurrencyInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> {
  /** Value in whole rupees. */
  value?: number;
  onValueChange?: (value: number | undefined) => void;
  invalid?: boolean;
  currencySymbol?: string;
}

/** Numeric input for rupee amounts. Stores/emits whole rupees; persisted values are paise (see data-model.md). */
export const CurrencyInput = React.forwardRef<HTMLInputElement, CurrencyInputProps>(
  ({ className, value, onValueChange, invalid, currencySymbol = "₹", ...props }, ref) => {
    const [raw, setRaw] = React.useState(value !== undefined ? String(value) : "");

    React.useEffect(() => {
      setRaw(value !== undefined ? String(value) : "");
    }, [value]);

    return (
      <div className="relative flex items-center">
        <span className="pointer-events-none absolute left-3 text-body text-muted" aria-hidden="true">
          {currencySymbol}
        </span>
        <input
          ref={ref}
          type="text"
          inputMode="decimal"
          aria-invalid={invalid || undefined}
          value={raw}
          onChange={(e) => {
            const next = e.target.value;
            if (!/^\d*\.?\d{0,2}$/.test(next)) return;
            setRaw(next);
            onValueChange?.(next === "" ? undefined : Number(next));
          }}
          className={cn(
            "h-9 w-full rounded-md border border-border bg-surface pl-7 pr-3 text-right text-body tabular text-foreground placeholder:text-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            invalid && "border-danger focus-visible:ring-danger",
            className
          )}
          {...props}
        />
      </div>
    );
  }
);
CurrencyInput.displayName = "CurrencyInput";
