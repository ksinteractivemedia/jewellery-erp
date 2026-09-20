"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@jewellery/ui";

const ALL = "__all__";

/** A "Any …" dropdown for list filters. Radix Select forbids an empty-string item value, so "no filter" is a sentinel mapped to undefined. */
export function FilterSelect({
  label,
  allLabel,
  value,
  onChange,
  options,
  className,
}: {
  label: string;
  allLabel: string;
  value?: string;
  onChange: (value: string | undefined) => void;
  options: { value: string; label: string }[];
  className?: string;
}) {
  return (
    <Select value={value ?? ALL} onValueChange={(v) => onChange(v === ALL ? undefined : v)}>
      <SelectTrigger aria-label={label} className={className ?? "w-full md:w-40"}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{allLabel}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
