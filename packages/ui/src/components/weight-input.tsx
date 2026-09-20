"use client";

import * as React from "react";
import { cn } from "../lib/utils";

export interface WeightInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> {
  /** Value in grams. */
  value?: number;
  onValueChange?: (value: number | undefined) => void;
  invalid?: boolean;
  unit?: "g" | "ct";
}

/** Numeric input for weights (gross/stone/net/fine metal weight), always grams internally. */
export const WeightInput = React.forwardRef<HTMLInputElement, WeightInputProps>(
  ({ className, value, onValueChange, invalid, unit = "g", ...props }, ref) => {
    const [raw, setRaw] = React.useState(value !== undefined ? String(value) : "");

    React.useEffect(() => {
      setRaw(value !== undefined ? String(value) : "");
    }, [value]);

    return (
      <div className="relative flex items-center">
        <input
          ref={ref}
          type="text"
          inputMode="decimal"
          aria-invalid={invalid || undefined}
          value={raw}
          onChange={(e) => {
            const next = e.target.value;
            if (!/^\d*\.?\d{0,3}$/.test(next)) return;
            setRaw(next);
            onValueChange?.(next === "" ? undefined : Number(next));
          }}
          className={cn(
            "h-9 w-full rounded-md border border-border bg-surface pl-3 pr-9 text-right text-body tabular text-foreground placeholder:text-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            invalid && "border-danger focus-visible:ring-danger",
            className
          )}
          {...props}
        />
        <span className="pointer-events-none absolute right-3 text-body-sm text-muted" aria-hidden="true">
          {unit}
        </span>
      </div>
    );
  }
);
WeightInput.displayName = "WeightInput";
