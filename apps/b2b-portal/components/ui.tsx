"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, Check, Circle, Loader2 } from "lucide-react";
import type { CreditCheck, CreditPosition } from "@jewellery/types";
import { cn } from "@jewellery/ui";
import { money, money0 } from "../lib/money";
import { TONE_CLASS, type Step, type Tone } from "../lib/status";

export const Pill = ({ label, tone }: { label: string; tone: Tone }) => <span className={cn("chip", TONE_CLASS[tone])}>{label}</span>;
export const StatusPill = ({ map, status }: { map: Record<string, [string, Tone]>; status: string }) => <Pill label={map[status]?.[0] ?? status} tone={map[status]?.[1] ?? "neutral"} />;

export function PageHead({ title, sub, actions }: { title: string; sub?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-[1.375rem] font-semibold leading-tight tracking-tight">{title}</h1>
        {sub && <p className="mt-0.5 text-[0.8125rem] text-muted">{sub}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export const Loading = ({ rows = 5 }: { rows?: number }) => (
  <div className="flex flex-col gap-2" role="status" aria-label="Loading">{Array.from({ length: rows }, (_, i) => <div key={i} className="h-10 animate-pulse rounded-md bg-surface-sunken" />)}</div>
);
export const Failure = ({ error, retry }: { error: unknown; retry?: () => void }) => (
  <div className="flex items-center justify-between gap-3 rounded-md border border-danger bg-danger-subtle p-3 text-danger" role="alert">
    <span>{error instanceof Error ? error.message : "Something went wrong."}</span>
    {retry && <button className="btn btn-outline btn-sm" onClick={retry}>Retry</button>}
  </div>
);
export const Empty = ({ title, hint, action }: { title: string; hint?: string; action?: React.ReactNode }) => (
  <div className="card flex flex-col items-center gap-2 border-dashed px-6 py-14 text-center" data-testid="empty">
    <p className="font-semibold">{title}</p>
    {hint && <p className="max-w-md text-muted">{hint}</p>}
    {action}
  </div>
);

export function Stat({ label, value, sub, tone, href, testId }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: Tone; href?: string; testId?: string }) {
  const body = (
    <div className={cn("card h-full p-4 transition-colors", href && "hover:border-foreground", tone === "bad" && "border-danger")} data-testid={testId}>
      <p className="label">{label}</p>
      <p className={cn("num mt-1 text-[1.375rem] font-semibold leading-tight", tone === "bad" && "text-danger", tone === "good" && "text-success")}>{value}</p>
      {sub && <p className="mt-0.5 text-[0.75rem] text-muted">{sub}</p>}
    </div>
  );
  return href ? <Link href={href} className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{body}</Link> : body;
}

/** Credit at a glance: the limit as a bar of what is owed, what is promised on approved orders, and what is left. */
export function CreditPanel({ p, compact = false }: { p: CreditPosition; compact?: boolean }) {
  const pct = (n: number) => `${Math.min(Math.max(n / Math.max(p.limit, 1), 0), 1) * 100}%`;
  const over = p.available < 0;
  return (
    <div className="flex flex-col gap-3" data-testid="credit-panel">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <p className="label">Available credit</p>
          <p className={cn("num text-[1.5rem] font-semibold leading-tight", over ? "text-danger" : "text-success")} data-testid="credit-available">{over ? `−${money0(-p.available)}` : money0(p.available)}</p>
        </div>
        <div className="text-right"><p className="label">Credit limit</p><p className="num text-[1rem] font-medium" data-testid="credit-limit">{money0(p.limit)}</p></div>
      </div>
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-surface-sunken" role="img" aria-label={`Outstanding ${money0(p.outstanding)}, committed ${money0(p.committed)}, of a ${money0(p.limit)} limit`}>
        <div className={cn("h-full", p.overdue > 0 ? "bg-danger" : "bg-foreground")} style={{ width: pct(p.outstanding) }} />
        <div className="h-full bg-primary" style={{ width: pct(p.committed) }} />
      </div>
      <dl className={cn("grid gap-x-4 gap-y-1 text-[0.8125rem]", compact ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-4")}>
        <div><dt className="flex items-center gap-1.5 text-muted"><i className="inline-block h-2 w-2 rounded-full bg-foreground" />Outstanding</dt><dd className="num font-medium" data-testid="credit-outstanding">{money0(p.outstanding)}</dd></div>
        <div><dt className="flex items-center gap-1.5 text-muted"><i className="inline-block h-2 w-2 rounded-full bg-primary" />On approved orders</dt><dd className="num font-medium" data-testid="credit-committed">{money0(p.committed)}</dd></div>
        <div><dt className="text-muted">Overdue</dt><dd className={cn("num font-medium", p.overdue > 0 && "text-danger")} data-testid="credit-overdue">{money0(p.overdue)}</dd></div>
        {p.onHold && <div><dt className="text-muted">Status</dt><dd className="font-medium text-danger">On credit hold</dd></div>}
      </dl>
    </div>
  );
}

/** The credit rule's verdict on an order, with what to do about it. The portal only shows this; the API decides. */
export function CreditWarning({ check, held = false }: { check: CreditCheck; held?: boolean }) {
  if (!check.requiresApproval) return null;
  return (
    <div className="rounded-md border border-warning bg-warning-subtle p-3" role="alert" data-testid="credit-warning">
      <p className="flex items-center gap-2 font-semibold text-warning"><AlertTriangle className="h-4 w-4" aria-hidden="true" />{held ? "This order is on hold for credit approval" : "This order needs credit approval"}</p>
      <ul className="mt-2 flex flex-col gap-2">
        {check.reasons.map((r) => (
          <li key={r.code} className="text-[0.8125rem]"><span className="font-medium">{r.message}</span><br /><span className="text-muted">What you can do: {r.action}</span></li>
        ))}
      </ul>
      <p className="mt-2 text-[0.75rem] text-muted">{held ? "Approval is decided by our credit team, not on this screen." : "You can still submit — our team will review it. Approval is decided on our side, not on this screen."}</p>
    </div>
  );
}

export function Steps({ steps }: { steps: Step[] }) {
  return (
    <ol className="flex flex-wrap gap-x-1 gap-y-2" aria-label="Order progress" data-testid="steps">
      {steps.map((s, i) => (
        <li key={s.label} className="flex items-center gap-1" aria-current={s.state === "current" ? "step" : undefined}>
          <span className={cn("flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.75rem] font-medium", s.state === "done" && "border-success bg-success-subtle text-success", s.state === "current" && "border-primary bg-primary-subtle", s.state === "blocked" && "border-danger bg-danger-subtle text-danger", s.state === "todo" && "text-muted")} data-state={s.state}>
            {s.state === "done" ? <Check className="h-3 w-3" aria-hidden="true" /> : s.state === "current" ? <Loader2 className="h-3 w-3" aria-hidden="true" /> : s.state === "blocked" ? <AlertTriangle className="h-3 w-3" aria-hidden="true" /> : <Circle className="h-3 w-3" aria-hidden="true" />}
            {s.label}{s.note ? ` · ${s.note}` : ""}
          </span>
          {i < steps.length - 1 && <span className="text-border" aria-hidden="true">—</span>}
        </li>
      ))}
    </ol>
  );
}

export const Amount = ({ v, strong = false }: { v: number; strong?: boolean }) => <span className={cn("num", strong && "font-semibold")}>{money(v)}</span>;

/** A horizontally scrollable table wrapper — data-dense on a desk, still usable on a phone. */
export const TableWrap = ({ children }: { children: React.ReactNode }) => <div className="card overflow-x-auto">{children}</div>;

export function TotalsBox({ taxable, gst, total, complete = true, testId = "totals" }: { taxable: number; gst: number; total: number; complete?: boolean; testId?: string }) {
  return (
    <dl className="flex flex-col gap-1.5 text-[0.8125rem]" data-testid={testId}>
      <div className="flex justify-between"><dt className="text-muted">Taxable value</dt><dd className="num" data-testid={`${testId}-taxable`}>{money(taxable)}</dd></div>
      <div className="flex justify-between"><dt className="text-muted">GST</dt><dd className="num" data-testid={`${testId}-gst`}>{money(gst)}</dd></div>
      <div className="flex justify-between border-t border-foreground pt-2 text-[1rem] font-semibold"><dt>{complete ? "Total" : "Total (priced lines)"}</dt><dd className="num" data-testid={`${testId}-total`}>{money(total)}</dd></div>
      {!complete && <p className="text-[0.75rem] text-warning">Some lines are price on request and are not included — we’ll quote them.</p>}
    </dl>
  );
}
