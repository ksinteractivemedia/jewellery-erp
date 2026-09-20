import * as React from "react";
import { Building2, Factory, FlaskConical, MapPin, Package, ShieldCheck, Truck, Vault, Wrench } from "lucide-react";
import { cn } from "../lib/utils";

export type LocationType =
  | "STORE"
  | "WAREHOUSE"
  | "COUNTER"
  | "VAULT"
  | "JOB_WORKER"
  | "HALLMARKING_CENTER"
  | "REPAIR_CENTER"
  | "MANUFACTURING_UNIT"
  | "IN_TRANSIT_VIRTUAL";

const icons: Record<LocationType, React.ComponentType<{ className?: string }>> = {
  STORE: Building2,
  WAREHOUSE: Package,
  COUNTER: MapPin,
  VAULT: Vault,
  JOB_WORKER: FlaskConical,
  HALLMARKING_CENTER: ShieldCheck,
  REPAIR_CENTER: Wrench,
  MANUFACTURING_UNIT: Factory,
  IN_TRANSIT_VIRTUAL: Truck,
};

export interface StockLocationBadgeProps {
  name: string;
  type: LocationType;
  className?: string;
}

/** Shows which physical/virtual location currently holds an InventoryItem. */
export function StockLocationBadge({ name, type, className }: StockLocationBadgeProps) {
  const Icon = icons[type];
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-body-sm text-foreground", className)}>
      <Icon className="h-3.5 w-3.5 text-muted" aria-hidden="true" />
      {name}
    </span>
  );
}
