import type { StorePrice } from "@jewellery/types";
import { cn } from "@jewellery/ui";
import { formatMoney, formatTime } from "../../lib/money";

const SIZE = { sm: "text-body font-medium", md: "text-h4 font-medium", lg: "text-h2 font-normal font-display" } as const;

/** The orange dot that says "this number is alive". It is the storefront's signal that a price is calculated, not printed. */
export function LiveDot({ label = "Live price", className }: { label?: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-[0.6875rem] font-medium uppercase tracking-[0.14em] text-muted", className)} title="Calculated now from today's metal rate — it moves when the rate does">
      <span className="relative flex h-1.5 w-1.5" aria-hidden="true">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60 motion-reduce:animate-none" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
      </span>
      {label}
    </span>
  );
}

/**
 * A price as the API gave it. A live price is shown WITH the mark that it is live; a piece the API could not price says
 * "Price on request" — this component has no way to print a number the API did not supply.
 */
export function PriceTag({ price, size = "md", className, showLive = true }: { price: StorePrice; size?: keyof typeof SIZE; className?: string; showLive?: boolean }) {
  if (price.status === "ON_REQUEST") {
    return <span className={cn("tabular text-muted", size === "lg" ? "font-display text-h3" : "text-body-sm", className)} data-testid="price-on-request">Price on request</span>;
  }
  return (
    <span className={cn("flex flex-wrap items-baseline gap-x-3 gap-y-1", className)} data-testid="price">
      <span className={cn("tabular text-foreground", SIZE[size])} data-testid="price-amount">{formatMoney(price.total)}</span>
      {showLive && <LiveDot />}
    </span>
  );
}

/** The plain-language footnote under a price: what it includes and when it was worked out. */
export function PriceNote({ price, className }: { price: StorePrice; className?: string }) {
  if (price.status === "ON_REQUEST") return <p className={cn("text-body-sm text-muted", className)}>{price.message}</p>;
  return (
    <p className={cn("text-body-sm text-muted", className)} data-testid="price-note">
      Inclusive of GST. Calculated live from today’s {price.basis.metalName.toLowerCase()} rate — updated {formatTime(price.computedAt)} IST — and confirmed when you check out.
    </p>
  );
}
