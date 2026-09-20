import * as React from "react";
import { StatusBadge, type StatusTone } from "./status-badge";

/** Mirrors Order.status in docs/data-model.md. */
export type OrderStatus =
  | "DRAFT"
  | "PENDING_PAYMENT"
  | "CONFIRMED"
  | "RESERVATION_FAILED"
  | "FULFILLED"
  | "CANCELLED";

const config: Record<OrderStatus, { label: string; tone: StatusTone }> = {
  DRAFT: { label: "Draft", tone: "neutral" },
  PENDING_PAYMENT: { label: "Pending payment", tone: "warning" },
  CONFIRMED: { label: "Confirmed", tone: "info" },
  RESERVATION_FAILED: { label: "Reservation failed", tone: "danger" },
  FULFILLED: { label: "Fulfilled", tone: "success" },
  CANCELLED: { label: "Cancelled", tone: "neutral" },
};

export interface OrderStatusBadgeProps {
  status: OrderStatus;
  className?: string;
}

export function OrderStatusBadge({ status, className }: OrderStatusBadgeProps) {
  const { label, tone } = config[status];
  return <StatusBadge tone={tone} label={label} className={className} />;
}
