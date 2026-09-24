"use client";

import { Badge } from "@jewellery/ui";
export { Field, Load, Table, Td, Th, btn, inputCls } from "../shared/kit";

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const inr0 = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
export const money = (paise: number) => inr.format(paise / 100);
export const money0 = (paise: number) => inr0.format(paise / 100);
export const day = (v: string) => new Date(/^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T00:00:00+05:30` : v).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
export const grams = (g?: number) => (g === undefined ? "—" : `${g.toFixed(3).replace(/0+$/, "").replace(/\.$/, "")} g`);
export const rupeesToPaise = (t: string) => (/^\d+(\.\d{1,2})?$/.test(t.replace(/[,\s₹]/g, "")) ? Math.round(Number(t.replace(/[,\s₹]/g, "")) * 100) : undefined);

type Variant = "neutral" | "success" | "warning" | "danger" | "info";
const TONES: Record<string, Variant> = {
  // Requisition / purchase order
  DRAFT: "neutral", SUBMITTED: "info", APPROVED: "success", REJECTED: "danger", CONVERTED: "success", CANCELLED: "neutral",
  PARTIALLY_RECEIVED: "warning", RECEIVED: "success",
  // Supplier invoice / payment
  UNPAID: "warning", PARTIALLY_PAID: "info", PAID: "success",
  RECORDED: "success", REVERSED: "danger",
};
export const Status = ({ s }: { s: string }) => <Badge variant={TONES[s] ?? "neutral"} data-testid="status">{s.replace(/_/g, " ").toLowerCase().replace(/^./, (c) => c.toUpperCase())}</Badge>;

export const PURCHASE_TYPE_LABEL: Record<string, string> = { GOLD: "Gold", SILVER: "Silver", PLATINUM: "Platinum", STONE: "Stone", FINISHED_JEWELLERY: "Finished jewellery", RAW_MATERIAL: "Raw material", CONSUMABLE: "Consumable" };
export const WEIGHT_TRACKED = new Set(["GOLD", "SILVER", "PLATINUM", "RAW_MATERIAL", "STONE"]);
