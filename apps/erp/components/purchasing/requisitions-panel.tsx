"use client";

import * as React from "react";
import type { PurchaseRequisition } from "@jewellery/types";
import { PERMISSIONS as P } from "@jewellery/types";
import { useAuth } from "../../lib/auth/auth-context";
import { purchasingApi, useRequisitions, usePurchasingAction } from "../../lib/api/purchasing";
import { errorMessage } from "../../lib/api/queries";
import { Field, Load, Status, Table, Td, Th, btn, inputCls, money } from "./shared";

/** A requisition row with its own inline approve/reject/cancel actions — folded into the Purchase Orders screen since it has no nav entry of its own (a requisition is just the step before a PO). */
function RequisitionRow({ pr, onDone }: { pr: PurchaseRequisition; onDone: () => void }) {
  const { can } = useAuth();
  const [mode, setMode] = React.useState<"" | "reject" | "cancel">("");
  const [reason, setReason] = React.useState("");
  const [err, setErr] = React.useState<string>();
  const done = () => { setMode(""); setErr(undefined); onDone(); };
  const fail = (e: unknown) => setErr(errorMessage(e));
  const submit = usePurchasingAction(() => purchasingApi.submitRequisition(pr.id), "Submitted", done as () => void);
  const approve = usePurchasingAction(() => purchasingApi.approveRequisition(pr.id), "Approved", done as () => void);
  const reject = usePurchasingAction(() => purchasingApi.rejectRequisition(pr.id, reason.trim()), "Rejected", done as () => void);
  const cancel = usePurchasingAction(() => purchasingApi.cancelRequisition(pr.id, reason.trim() || undefined), "Cancelled", done as () => void);
  const approver = can(P.PURCHASING_APPROVE);
  return (
    <>
      <tr data-testid="pr-row"><Td className="font-medium">{pr.prNo}</Td><Td>{pr.requestedBy.name}</Td><Td className="max-w-xs truncate">{pr.reason}</Td><Td right>{money(pr.totals.total)}</Td><Td><Status s={pr.status} /></Td>
        <Td>
          <span className="flex flex-wrap items-center gap-2">
            {pr.status === "DRAFT" && <button className={btn()} onClick={() => submit.mutate(undefined, { onError: fail })} data-testid="pr-submit">Submit</button>}
            {approver && pr.status === "SUBMITTED" && <button className={btn("primary")} onClick={() => approve.mutate(undefined, { onError: fail })} data-testid="pr-approve">Approve</button>}
            {approver && pr.status === "SUBMITTED" && <button className={btn("danger")} onClick={() => setMode("reject")} data-testid="pr-reject">Reject…</button>}
            {["DRAFT", "SUBMITTED", "APPROVED"].includes(pr.status) && <button className={btn()} onClick={() => setMode("cancel")} data-testid="pr-cancel">Cancel…</button>}
          </span>
        </Td></tr>
      {(mode || err) && (
        <tr><td colSpan={6} className="border-b border-border-subtle bg-surface-sunken px-3 py-3">
          {err && <p className="mb-2 text-body-sm text-danger" role="alert">{err}</p>}
          {mode && <div className="flex flex-wrap items-end gap-2"><Field label="Reason"><input className={`${inputCls} w-80`} value={reason} onChange={(e) => setReason(e.target.value)} data-testid="pr-reason" /></Field><button className={btn(mode === "reject" ? "danger" : "danger")} disabled={mode === "reject" ? !reason.trim() : false} onClick={() => (mode === "reject" ? reject : cancel).mutate(undefined, { onError: fail })} data-testid="pr-reason-go">{mode === "reject" ? "Reject" : "Cancel requisition"}</button><button className={btn()} onClick={() => { setMode(""); setErr(undefined); }}>Close</button></div>}
        </td></tr>
      )}
    </>
  );
}

export function RequisitionsPanel() {
  const [open, setOpen] = React.useState(false);
  const q = useRequisitions();
  const openCount = (q.data ?? []).filter((p) => p.status === "SUBMITTED").length;
  return (
    <div className="flex flex-col gap-2">
      <button type="button" className="flex items-center gap-2 text-body-sm font-medium text-foreground hover:underline" onClick={() => setOpen((v) => !v)} data-testid="pr-panel-toggle">
        {open ? "▾" : "▸"} Requisitions{openCount > 0 && <span className="rounded-full bg-warning-subtle px-2 py-0.5 text-caption text-warning">{openCount} to review</span>}
      </button>
      {open && (
        <Load q={q}>
          {(q.data ?? []).length === 0 ? <p className="rounded-lg border border-dashed border-border p-6 text-center text-muted">No requisitions yet.</p> : (
            <Table testId="pr-table"><thead><tr><Th>PR</Th><Th>Requested by</Th><Th>Reason</Th><Th right>Total</Th><Th>Status</Th><Th>Actions</Th></tr></thead><tbody>{(q.data ?? []).map((pr) => <RequisitionRow key={pr.id + pr.status} pr={pr} onDone={() => q.refetch()} />)}</tbody></Table>
          )}
        </Load>
      )}
    </div>
  );
}
