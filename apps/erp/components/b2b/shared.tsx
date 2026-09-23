"use client";

import * as React from "react";
import { AlertTriangle } from "lucide-react";
import type { CreditCheck, CreditPosition } from "@jewellery/types";
import { Alert, Badge, Skeleton, cn } from "@jewellery/ui";
import { errorMessage } from "../../lib/api/queries";

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const inr0 = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
export const money = (paise: number) => inr.format(paise / 100);
export const money0 = (paise: number) => inr0.format(paise / 100);
export const day = (v: string) => new Date(/^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T00:00:00+05:30` : v).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
export const rupeesToPaise = (t: string) => (/^\d+(\.\d{1,2})?$/.test(t.replace(/[,\s₹]/g, "")) ? Math.round(Number(t.replace(/[,\s₹]/g, "")) * 100) : undefined);

type Variant = "neutral" | "success" | "warning" | "danger" | "info";
const TONES: Record<string, Variant> = {
  // Purchase order / quotation
  DRAFT: "neutral", SUBMITTED: "info", UNDER_REVIEW: "info", QUOTED: "warning", NEGOTIATION: "warning", APPROVED: "success", REJECTED: "danger", EXPIRED: "danger", CONVERTED: "success", CANCELLED: "neutral", SUPERSEDED: "neutral",
  // Sales order
  CONFIRMED: "success", PARTIALLY_ALLOCATED: "warning", ALLOCATED: "info", PARTIALLY_FULFILLED: "warning", FULFILLED: "success",
  // Invoice / payment
  UNPAID: "warning", PARTIALLY_PAID: "info", PAID: "success", OVERDUE: "danger",
  PENDING_VERIFICATION: "warning", VERIFIED: "success", REVERSED: "danger",
};
export const Status = ({ s }: { s: string }) => <Badge variant={TONES[s] ?? "neutral"} data-testid="status">{s.replace(/_/g, " ").toLowerCase().replace(/^./, (c) => c.toUpperCase())}</Badge>;
/** A sales order's DRAFT means "held for credit approval" — a different, more urgent thing than a PO or quotation draft. */
export const SoStatus = ({ s }: { s: string }) => (s === "DRAFT" ? <Badge variant="danger" data-testid="status">Held — credit approval</Badge> : <Status s={s} />);

export const Th = ({ children, right }: { children?: React.ReactNode; right?: boolean }) => <th className={cn("whitespace-nowrap border-b border-border bg-surface-sunken px-3 py-2 text-caption font-semibold uppercase tracking-wide text-muted", right ? "text-right" : "text-left")}>{children}</th>;
export const Td = ({ children, right, className }: { children?: React.ReactNode; right?: boolean; className?: string }) => <td className={cn("border-b border-border-subtle px-3 py-2.5 align-middle text-body-sm", right && "text-right tabular", className)}>{children}</td>;
export const Table = ({ children, testId }: { children: React.ReactNode; testId?: string }) => <div className="overflow-x-auto rounded-lg border border-border-subtle bg-surface"><table className="w-full border-collapse" data-testid={testId}>{children}</table></div>;

export function Load({ q, children, rows = 5 }: { q: { isLoading: boolean; isError: boolean; error: unknown; refetch: () => unknown }; children: React.ReactNode; rows?: number }) {
  if (q.isLoading) return <div className="flex flex-col gap-2">{Array.from({ length: rows }, (_, i) => <Skeleton key={i} className="h-10" />)}</div>;
  if (q.isError) return <Alert variant="danger" title="Couldn't load this">{errorMessage(q.error)} <button className="underline" onClick={() => q.refetch()}>Retry</button></Alert>;
  return <>{children}</>;
}

export function CreditLine({ p }: { p: CreditPosition }) {
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-body-sm sm:grid-cols-5" data-testid="credit-line">
      <div><dt className="text-muted">Limit</dt><dd className="tabular font-medium">{money0(p.limit)}</dd></div>
      <div><dt className="text-muted">Outstanding</dt><dd className="tabular font-medium">{money0(p.outstanding)}</dd></div>
      <div><dt className="text-muted">On approved orders</dt><dd className="tabular font-medium">{money0(p.committed)}</dd></div>
      <div><dt className="text-muted">Available</dt><dd className={cn("tabular font-medium", p.available < 0 && "text-danger")}>{p.available < 0 ? `−${money0(-p.available)}` : money0(p.available)}</dd></div>
      <div><dt className="text-muted">Overdue</dt><dd className={cn("tabular font-medium", p.overdue > 0 && "text-danger")}>{money0(p.overdue)}</dd></div>
    </dl>
  );
}

/** What the credit rule says about an order, in the backend's own words. */
export function CreditVerdict({ check }: { check: CreditCheck }) {
  if (!check.requiresApproval) return <p className="text-body-sm text-success" data-testid="credit-ok">Within credit terms.</p>;
  return (
    <div className="rounded-md border border-warning bg-warning-subtle p-3" role="alert" data-testid="credit-verdict">
      <p className="flex items-center gap-2 font-semibold text-warning"><AlertTriangle className="h-4 w-4" aria-hidden="true" />Needs credit approval</p>
      <ul className="mt-1 flex flex-col gap-1 text-body-sm">{check.reasons.map((r) => <li key={r.code}>{r.message}</li>)}</ul>
    </div>
  );
}

export const Field = ({ label, children }: { label: string; children: React.ReactNode }) => <label className="flex flex-col gap-1 text-caption font-medium text-muted">{label}{children}</label>;
export const inputCls = "h-9 rounded-md border border-border bg-surface px-3 text-body-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
export const btn = (kind: "primary" | "outline" | "danger" = "outline") => cn("inline-flex h-9 items-center justify-center gap-2 rounded-md px-3.5 text-body-sm font-medium transition-colors disabled:opacity-50", kind === "primary" && "bg-primary text-[var(--palette-black)] hover:bg-primary-hover", kind === "outline" && "border border-border bg-surface hover:border-foreground", kind === "danger" && "border border-danger text-danger hover:bg-danger-subtle");
