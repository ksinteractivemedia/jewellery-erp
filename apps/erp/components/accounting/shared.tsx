"use client";

import * as React from "react";
import { Badge, cn } from "@jewellery/ui";
import { Td } from "../shared/kit";

export { Field, Load, Table, Td, Th, btn, inputCls } from "../shared/kit";

export const day = (v: string) => new Date(v).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
export const rupees = (paise: number) => `₹${(paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

type Variant = "neutral" | "success" | "warning" | "danger" | "info";
const TONES: Record<string, Variant> = {
  ISSUED: "info", CANCELLED: "neutral", UNPAID: "neutral", PARTIALLY_PAID: "warning", PAID: "success", OVERDUE: "danger",
};
export const Status = ({ s }: { s: string }) => <Badge variant={TONES[s] ?? "neutral"} data-testid="status">{s.replace(/_/g, " ").toLowerCase().replace(/^./, (c) => c.toUpperCase())}</Badge>;

export function Stat({ label, value, tone }: { label: string; value: React.ReactNode; tone?: "warning" | "danger" }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <p className="text-body-sm text-muted">{label}</p>
      <p className={cn("mt-1 text-h3 font-display tabular", tone === "warning" ? "text-warning" : tone === "danger" ? "text-danger" : "text-foreground")}>{value}</p>
    </div>
  );
}

/** Debit/credit shown the way ledgers always are: the amount in one column, blank in the other. */
export function DrCr({ direction, amount }: { direction: "DEBIT" | "CREDIT"; amount: number }) {
  return (
    <>
      <Td right>{direction === "DEBIT" ? rupees(amount) : ""}</Td>
      <Td right>{direction === "CREDIT" ? rupees(amount) : ""}</Td>
    </>
  );
}
