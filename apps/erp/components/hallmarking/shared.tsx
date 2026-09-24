"use client";

import { Badge } from "@jewellery/ui";

export { Field, Load, Table, Td, Th, btn, inputCls } from "../shared/kit";

export const day = (v: string) => new Date(/^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T00:00:00+05:30` : v).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
export const grams = (g?: number) => (g === undefined ? "—" : `${g.toFixed(3).replace(/0+$/, "").replace(/\.$/, "")} g`);

type Variant = "neutral" | "success" | "warning" | "danger" | "info";
const TONES: Record<string, Variant> = {
  PENDING: "neutral", IN_TRANSIT: "info", AT_CENTRE: "info", RECEIVED: "warning", VERIFIED: "success", FAILED: "danger", CANCELLED: "neutral",
};
export const Status = ({ s }: { s: string }) => <Badge variant={TONES[s] ?? "neutral"} data-testid="status">{s.replace(/_/g, " ").toLowerCase().replace(/^./, (c) => c.toUpperCase())}</Badge>;

export const HuidTag = ({ huid }: { huid?: string }) => huid ? <span className="font-mono text-body-sm">{huid}</span> : <span className="text-muted">—</span>;
