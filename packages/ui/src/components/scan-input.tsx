"use client";

import * as React from "react";
import { Loader2, ScanLine } from "lucide-react";
import { cn } from "../lib/utils";

export interface ScanInputProps {
  /** Called with the trimmed text when the user (or a scanner acting as a keyboard) presses Enter. */
  onScan: (code: string) => void;
  loading?: boolean;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
  "aria-label"?: string;
}

/**
 * A field for codes rather than searches: Enter submits and the field clears, ready for the next scan.
 * Barcode scanners present as keyboards that "type" the code and press Enter, so this works with them
 * unchanged — and with a human typing an item code.
 */
export function ScanInput({ onScan, loading, placeholder = "Scan or type a code", className, autoFocus, "aria-label": ariaLabel = "Scan a code" }: ScanInputProps) {
  const [value, setValue] = React.useState("");
  return (
    <div className={cn("relative flex items-center", className)}>
      {loading ? <Loader2 className="absolute left-3 h-4 w-4 animate-spin text-muted" aria-hidden="true" /> : <ScanLine className="pointer-events-none absolute left-3 h-4 w-4 text-muted" aria-hidden="true" />}
      <input
        value={value}
        autoFocus={autoFocus}
        aria-label={ariaLabel}
        placeholder={placeholder}
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        data-scan-target
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== "Enter") return;
          e.preventDefault();
          const code = value.trim();
          if (code) {
            onScan(code);
            setValue("");
          }
        }}
        className="h-9 w-full rounded-md border border-border bg-surface pl-9 pr-3 font-mono text-body-sm text-foreground placeholder:font-sans placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
    </div>
  );
}
