import type { StoreAvailability } from "@jewellery/types";
import { BadgeCheck } from "lucide-react";
import { cn } from "@jewellery/ui";

/** What can really be bought right now. "Only N left" appears only when N is small and true. */
export function AvailabilityBadge({ availability, className }: { availability: StoreAvailability; className?: string }) {
  const { status, remaining } = availability;
  const text = status === "OUT_OF_STOCK" ? "Currently unavailable" : status === "LOW_STOCK" ? `Only ${remaining} left` : "In stock";
  return (
    <span className={cn("inline-flex items-center gap-2 text-body-sm", className)} data-testid="availability" data-status={status}>
      <span className={cn("h-2 w-2 rounded-full", status === "OUT_OF_STOCK" ? "bg-border" : status === "LOW_STOCK" ? "bg-primary" : "bg-success")} aria-hidden="true" />
      <span className="text-foreground">{text}</span>
      {availability.hallmarked && (
        <span className="inline-flex items-center gap-1 text-muted" title="Every piece available carries a HUID (hallmark unique ID)">
          <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />Hallmarked · HUID
        </span>
      )}
    </span>
  );
}
