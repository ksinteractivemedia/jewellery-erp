import * as React from "react";
import { cn } from "../lib/utils";
import { formatCurrency } from "../lib/format";

export interface ProductPriceProps {
  price: number;
  compareAtPrice?: number;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizeClass = { sm: "text-body", md: "text-h4", lg: "text-h2" };

/** Customer-facing price. Always the resolved output of the pricing engine — never computed here. */
export function ProductPrice({ price, compareAtPrice, size = "md", className }: ProductPriceProps) {
  const onSale = compareAtPrice !== undefined && compareAtPrice > price;
  return (
    <div className={cn("flex items-baseline gap-2", className)}>
      <span className={cn("tabular font-medium text-foreground", sizeClass[size])}>{formatCurrency(price)}</span>
      {onSale && (
        <span className="tabular text-body-sm text-muted line-through">{formatCurrency(compareAtPrice)}</span>
      )}
    </div>
  );
}
