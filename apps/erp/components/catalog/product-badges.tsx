import { Gem } from "lucide-react";
import { Badge, StatusBadge, cn } from "@jewellery/ui";

/** Active/inactive describes whether the *design* is offered at all — not stock (that's InventoryItem status). */
export function ProductStatusBadge({ isActive }: { isActive: boolean }) {
  return <StatusBadge tone={isActive ? "success" : "neutral"} label={isActive ? "Active" : "Inactive"} />;
}

export function ChannelBadges({ b2c, b2b }: { b2c: boolean; b2b: boolean }) {
  if (!b2c && !b2b) return <span className="text-caption text-muted">ERP only</span>;
  return (
    <span className="inline-flex gap-1">
      {b2c && <Badge variant="primary">B2C</Badge>}
      {b2b && <Badge variant="info">B2B</Badge>}
    </span>
  );
}

export function ProductThumb({ url, name, className }: { url?: string; name: string; className?: string }) {
  return (
    <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md bg-surface-sunken text-muted", className)}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={name} className="h-full w-full object-cover" loading="lazy" />
      ) : (
        <Gem className="h-4 w-4" aria-hidden="true" />
      )}
    </span>
  );
}
