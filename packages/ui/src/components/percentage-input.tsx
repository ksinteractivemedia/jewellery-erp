import * as React from "react";
import { cn } from "../lib/utils";

export interface PercentageInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> {
  /** Value 0–100. */
  value?: number;
  onValueChange?: (value: number | undefined) => void;
  invalid?: boolean;
}

/** Numeric input for making-charge / wastage / discount percentages. */
export const PercentageInput = React.forwardRef<HTMLInputElement, PercentageInputProps>(
  ({ className, value, onValueChange, invalid, ...props }, ref) => {
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
            if (!/^\d{0,3}\.?\d{0,2}$/.test(next)) return;
            const num = next === "" ? undefined : Number(next);
            if (num !== undefined && num > 100) return;
            setRaw(next);
            onValueChange?.(num);
          }}
          className={cn(
            "h-9 w-full rounded-md border border-border bg-surface pl-3 pr-8 text-right text-body tabular text-foreground placeholder:text-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            invalid && "border-danger focus-visible:ring-danger",
            className
          )}
          {...props}
        />
        <span className="pointer-events-none absolute right-3 text-body-sm text-muted" aria-hidden="true">
          %
        </span>
      </div>
    );
  }
);
PercentageInput.displayName = "PercentageInput";
