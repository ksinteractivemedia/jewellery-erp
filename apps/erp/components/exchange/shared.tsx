"use client";

import { Badge } from "@jewellery/ui";

export { Field, Load, Table, Td, Th, btn, inputCls } from "../shared/kit";

export const day = (v: string) => new Date(v).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
export const rupees = (paise: number) => `₹${(paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const grams = (g?: number) => (g === undefined ? "—" : `${g.toFixed(3).replace(/0+$/, "").replace(/\.$/, "")} g`);

type Variant = "neutral" | "success" | "warning" | "danger" | "info";
const TONES: Record<string, Variant> = { DRAFT: "neutral", ASSESSED: "info", COMPLETED: "success", CANCELLED: "neutral" };
export const Status = ({ s }: { s: string }) => <Badge variant={TONES[s] ?? "neutral"} data-testid="status">{s.replace(/_/g, " ").toLowerCase().replace(/^./, (c) => c.toUpperCase())}</Badge>;
