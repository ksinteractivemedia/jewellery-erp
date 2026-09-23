"use client";

import * as React from "react";
import { Alert, Badge, Skeleton, cn } from "@jewellery/ui";
import { errorMessage } from "../../lib/api/queries";

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

export const Th = ({ children, right }: { children?: React.ReactNode; right?: boolean }) => <th className={cn("whitespace-nowrap border-b border-border bg-surface-sunken px-3 py-2 text-caption font-semibold uppercase tracking-wide text-muted", right ? "text-right" : "text-left")}>{children}</th>;
export const Td = ({ children, right, className }: { children?: React.ReactNode; right?: boolean; className?: string }) => <td className={cn("border-b border-border-subtle px-3 py-2.5 align-middle text-body-sm", right && "text-right tabular", className)}>{children}</td>;
export const Table = ({ children, testId }: { children: React.ReactNode; testId?: string }) => <div className="overflow-x-auto rounded-lg border border-border-subtle bg-surface"><table className="w-full border-collapse" data-testid={testId}>{children}</table></div>;

export function Load({ q, children, rows = 5 }: { q: { isLoading: boolean; isError: boolean; error: unknown; refetch: () => unknown }; children: React.ReactNode; rows?: number }) {
  if (q.isLoading) return <div className="flex flex-col gap-2">{Array.from({ length: rows }, (_, i) => <Skeleton key={i} className="h-10" />)}</div>;
  if (q.isError) return <Alert variant="danger" title="Couldn't load this">{errorMessage(q.error)} <button className="underline" onClick={() => q.refetch()}>Retry</button></Alert>;
  return <>{children}</>;
}

export const Field = ({ label, children }: { label: string; children: React.ReactNode }) => <label className="flex flex-col gap-1 text-caption font-medium text-muted">{label}{children}</label>;
export const inputCls = "h-9 rounded-md border border-border bg-surface px-3 text-body-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
export const btn = (kind: "primary" | "outline" | "danger" = "outline") => cn("inline-flex h-9 items-center justify-center gap-2 rounded-md px-3.5 text-body-sm font-medium transition-colors disabled:opacity-50", kind === "primary" && "bg-primary text-[var(--palette-black)] hover:bg-primary-hover", kind === "outline" && "border border-border bg-surface hover:border-foreground", kind === "danger" && "border border-danger text-danger hover:bg-danger-subtle");

export const PURCHASE_TYPE_LABEL: Record<string, string> = { GOLD: "Gold", SILVER: "Silver", PLATINUM: "Platinum", STONE: "Stone", FINISHED_JEWELLERY: "Finished jewellery", RAW_MATERIAL: "Raw material", CONSUMABLE: "Consumable" };
export const WEIGHT_TRACKED = new Set(["GOLD", "SILVER", "PLATINUM", "RAW_MATERIAL", "STONE"]);
