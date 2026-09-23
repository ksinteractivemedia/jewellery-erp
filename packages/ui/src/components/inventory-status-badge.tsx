import * as React from "react";
import { StatusBadge, type StatusTone } from "./status-badge";

/** Mirrors InventoryItem.status in docs/data-model.md — keep in sync if the enum changes. */
export type InventoryStatus =
  | "AVAILABLE"
  | "RESERVED"
  | "SOLD"
  | "RETURNED"
  | "DAMAGED"
  | "UNDER_REPAIR"
  | "IN_MANUFACTURING"
  | "WITH_JOB_WORKER"
  | "IN_TRANSIT"
  | "HALLMARKING"
  | "SCRAP"
  | "MELTING"
  | "RETURNED_TO_CUSTOMER";

const config: Record<InventoryStatus, { label: string; tone: StatusTone }> = {
  AVAILABLE: { label: "Available", tone: "success" },
  RESERVED: { label: "Reserved", tone: "info" },
  SOLD: { label: "Sold", tone: "neutral" },
  RETURNED: { label: "Returned", tone: "info" },
  DAMAGED: { label: "Damaged", tone: "danger" },
  UNDER_REPAIR: { label: "Under repair", tone: "warning" },
  IN_MANUFACTURING: { label: "In manufacturing", tone: "info" },
  WITH_JOB_WORKER: { label: "With job worker", tone: "warning" },
  IN_TRANSIT: { label: "In transit", tone: "info" },
  HALLMARKING: { label: "Hallmarking", tone: "warning" },
  SCRAP: { label: "Scrap", tone: "danger" },
  MELTING: { label: "Melting", tone: "danger" },
  RETURNED_TO_CUSTOMER: { label: "Returned to customer", tone: "neutral" },
};

export interface InventoryStatusBadgeProps {
  status: InventoryStatus;
  className?: string;
}

export function InventoryStatusBadge({ status, className }: InventoryStatusBadgeProps) {
  const { label, tone } = config[status];
  return <StatusBadge tone={tone} label={label} className={className} />;
}
