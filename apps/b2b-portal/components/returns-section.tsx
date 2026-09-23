"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { B2BSalesOrder } from "@jewellery/types";
import { ApiError } from "../lib/api";
import { date, money } from "../lib/money";
import { requestOrderReturn, useOrderReturns } from "../lib/queries";

const REASONS = [
  ["DEFECTIVE", "Defective"],
  ["WRONG_ITEM", "Wrong item"],
  ["NOT_AS_DESCRIBED", "Not as described"],
  ["SIZE_ISSUE", "Size issue"],
  ["CHANGED_MIND", "Changed our mind"],
  ["OTHER", "Other"],
] as const;

/** Requestable once something on the order has actually been invoiced — a return is checking a sold piece back in. */
const RETURN_ELIGIBLE_STATUSES = ["PARTIALLY_FULFILLED", "FULFILLED"];

export function ReturnsSection({ order }: { order: B2BSalesOrder }) {
  const qc = useQueryClient();
  const q = useOrderReturns(order.id);
  const [open, setOpen] = React.useState(false);
  const [lineRefs, setLineRefs] = React.useState<string[]>([]);
  const [reason, setReason] = React.useState<(typeof REASONS)[number][0]>("DEFECTIVE");
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string>();

  if (!RETURN_ELIGIBLE_STATUSES.includes(order.status) && !q.data?.length) return null;

  const toggle = (idx: number) => setLineRefs((refs) => (refs.includes(String(idx)) ? refs.filter((x) => x !== String(idx)) : [...refs, String(idx)]));
  const submit = async () => {
    setBusy(true);
    setError(undefined);
    try {
      await requestOrderReturn(order.id, lineRefs, reason, note.trim() || undefined);
      await qc.invalidateQueries({ queryKey: ["portal", "order", order.id, "returns"] });
      setOpen(false);
      setLineRefs([]);
      setNote("");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't submit that. Please try again.");
    }
    setBusy(false);
  };

  return (
    <div className="card flex flex-col gap-3 p-4" data-testid="returns-section">
      <h2 className="font-semibold">Returns</h2>
      {(q.data ?? []).map((r) => (
        <div key={r.id} className="flex flex-col gap-0.5 rounded-md border border-border-subtle p-3 text-[0.8125rem]" data-testid="return-row">
          <p className="font-medium">{r.returnNo} — {r.status.replace(/_/g, " ").toLowerCase()}</p>
          {r.rejectedReason && <p className="text-danger">{r.rejectedReason}</p>}
          {r.settlement && <p>Settled: {money(r.settlement.amount)}</p>}
          <p className="text-muted">Requested {date(r.createdAt)}</p>
        </div>
      ))}
      {RETURN_ELIGIBLE_STATUSES.includes(order.status) && (
        <>
          {!open && <button type="button" className="btn btn-outline self-start" onClick={() => setOpen(true)} data-testid="returns-open">Request a return</button>}
          {open && (
            <div className="flex flex-col gap-3 rounded-md border border-border p-3" data-testid="returns-form">
              <p className="text-[0.8125rem] font-medium">Which line(s)?</p>
              {order.lines.map((l, idx) => (
                <label key={idx} className="flex items-center gap-2 text-[0.8125rem]">
                  <input type="checkbox" checked={lineRefs.includes(String(idx))} onChange={() => toggle(idx)} data-testid="returns-line" />
                  {l.name} ({l.sku})
                </label>
              ))}
              <label className="flex flex-col gap-1 text-[0.8125rem]">
                Reason
                <select className="rounded-md border border-border bg-surface px-3 py-2" value={reason} onChange={(e) => setReason(e.target.value as (typeof REASONS)[number][0])} data-testid="returns-reason">
                  {REASONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-[0.8125rem]">
                Note (optional)
                <textarea className="rounded-md border border-border bg-surface px-3 py-2" rows={2} value={note} onChange={(e) => setNote(e.target.value)} data-testid="returns-note" />
              </label>
              {error && <p className="text-[0.8125rem] text-danger" role="alert" data-testid="returns-error">{error}</p>}
              <div className="flex gap-2">
                <button type="button" className="btn btn-primary" disabled={lineRefs.length === 0 || busy} onClick={submit} data-testid="returns-submit">Submit request</button>
                <button type="button" className="btn btn-outline" onClick={() => setOpen(false)}>Cancel</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
