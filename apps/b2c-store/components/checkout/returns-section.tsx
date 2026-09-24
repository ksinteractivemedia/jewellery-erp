"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { StoreOrder } from "@jewellery/types";
import { StoreApiError } from "../../lib/api";
import { checkoutKeys, requestReturn, useOrderReturns } from "../../lib/checkout-api";
import { formatDate } from "../../lib/money";

const REASONS = [
  ["DEFECTIVE", "It arrived defective"],
  ["WRONG_ITEM", "It's the wrong item"],
  ["NOT_AS_DESCRIBED", "Not as described"],
  ["SIZE_ISSUE", "Wrong size"],
  ["CHANGED_MIND", "I changed my mind"],
  ["OTHER", "Something else"],
] as const;

/** A return can be requested once an order has actually been paid — before that there's nothing sold to return. */
const RETURN_ELIGIBLE_STATUSES = ["PAID", "CONFIRMED", "PACKED", "SHIPPED", "DELIVERED"];

const STATUS_WORDS: Record<string, string> = {
  REQUESTED: "We've received your request and will review it shortly",
  APPROVED: "Approved — please send the piece back to us",
  REJECTED: "This return could not be approved",
  RECEIVED: "We've received the piece and will inspect it",
  INSPECTED: "Inspected — your refund is being arranged",
  SETTLED: "Complete",
  CANCELLED: "Cancelled",
};

export function ReturnsSection({ order, token }: { order: StoreOrder; token: string }) {
  const qc = useQueryClient();
  const q = useOrderReturns(order.orderNo, token);
  const [open, setOpen] = React.useState(false);
  const [lineIds, setLineIds] = React.useState<string[]>([]);
  const [reason, setReason] = React.useState<(typeof REASONS)[number][0]>("DEFECTIVE");
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string>();

  if (!RETURN_ELIGIBLE_STATUSES.includes(order.status) && !q.data?.length) return null;

  const toggle = (id: string) => setLineIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  const submit = async () => {
    setBusy(true);
    setError(undefined);
    try {
      await requestReturn(order.orderNo, token, lineIds, reason, note.trim() || undefined);
      await qc.invalidateQueries({ queryKey: checkoutKeys.returns(order.orderNo) });
      setOpen(false);
      setLineIds([]);
      setNote("");
    } catch (e) {
      setError(e instanceof StoreApiError ? e.message : "We couldn't submit that. Please try again.");
    }
    setBusy(false);
  };

  return (
    <section className="flex flex-col gap-4 border-t border-border pt-8" aria-label="Returns" data-testid="returns-section">
      <h3 className="font-display text-h3">Returns</h3>
      {(q.data ?? []).map((r) => (
        <div key={r.id} className="flex flex-col gap-1 border border-border-subtle p-4 text-body-sm" data-testid="return-row">
          <p className="font-medium">Return {r.returnNo} — {r.status.replace(/_/g, " ").toLowerCase()}</p>
          <p className="text-muted">{STATUS_WORDS[r.status] ?? r.status}</p>
          {r.rejectedReason && <p className="text-danger">{r.rejectedReason}</p>}
          {r.settlement && <p>Refunded: {(r.settlement.amount / 100).toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 })}</p>}
          <p className="text-caption text-muted">Requested {formatDate(r.createdAt)}</p>
        </div>
      ))}
      {RETURN_ELIGIBLE_STATUSES.includes(order.status) && (
        <>
          {!open && <button type="button" className="btn btn-outline self-start" onClick={() => setOpen(true)} data-testid="returns-open">Request a return</button>}
          {open && (
            <div className="flex flex-col gap-3 border border-border p-4" data-testid="returns-form">
              <p className="text-body-sm font-medium">Which piece(s)?</p>
              {order.items.map((item) => (
                <label key={item.id} className="flex min-h-11 items-center gap-2 text-body-sm">
                  <input type="checkbox" checked={lineIds.includes(item.id)} onChange={() => toggle(item.id)} data-testid="returns-line" />
                  {item.name} ({item.sku})
                </label>
              ))}
              <label className="flex flex-col gap-1 text-body-sm">
                Reason
                <select className="border border-border bg-surface px-3 py-2" value={reason} onChange={(e) => setReason(e.target.value as (typeof REASONS)[number][0])} data-testid="returns-reason">
                  {REASONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-body-sm">
                Tell us more (optional)
                <textarea className="border border-border bg-surface px-3 py-2" rows={2} value={note} onChange={(e) => setNote(e.target.value)} data-testid="returns-note" />
              </label>
              {error && <p className="text-body-sm text-danger" role="alert" data-testid="returns-error">{error}</p>}
              <div className="flex gap-2">
                <button type="button" className="btn btn-primary" disabled={lineIds.length === 0 || busy} onClick={submit} data-testid="returns-submit">Submit request</button>
                <button type="button" className="btn btn-outline" onClick={() => setOpen(false)}>Cancel</button>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
