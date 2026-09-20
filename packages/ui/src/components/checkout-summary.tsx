import * as React from "react";
import { cn } from "../lib/utils";
import { formatCurrency } from "../lib/format";

export interface CheckoutSummaryLine {
  label: string;
  amount: number;
  muted?: boolean;
}

export interface CheckoutSummaryProps {
  items: { name: string; image: string; quantity: number; price: number }[];
  lines: CheckoutSummaryLine[];
  total: number;
  className?: string;
}

/** Order summary shown alongside checkout forms — B2C payment step and B2B order review. */
export function CheckoutSummary({ items, lines, total, className }: CheckoutSummaryProps) {
  return (
    <div className={cn("flex flex-col gap-4 rounded-lg border border-border bg-surface p-5", className)}>
      <ul className="flex flex-col gap-3">
        {items.map((item, i) => (
          <li key={i} className="flex items-center gap-3">
            <div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={item.image} alt={item.name} className="h-14 w-12 rounded-md object-cover" />
              <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--palette-charcoal)] text-[10px] font-medium text-white">
                {item.quantity}
              </span>
            </div>
            <span className="flex-1 text-body-sm text-foreground">{item.name}</span>
            <span className="tabular text-body-sm text-foreground">{formatCurrency(item.price * item.quantity)}</span>
          </li>
        ))}
      </ul>
      <div className="flex flex-col gap-1.5 border-t border-border-subtle pt-3">
        {lines.map((line) => (
          <div key={line.label} className="flex items-center justify-between text-body-sm">
            <span className={line.muted ? "text-muted" : "text-foreground"}>{line.label}</span>
            <span className="tabular text-foreground">{formatCurrency(line.amount)}</span>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between border-t border-border-subtle pt-3 text-body-lg font-medium text-foreground">
        <span>Total</span>
        <span className="tabular">{formatCurrency(total)}</span>
      </div>
    </div>
  );
}
