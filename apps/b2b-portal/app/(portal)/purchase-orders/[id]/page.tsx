"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Paperclip, X } from "lucide-react";
import { date, dateTime, money } from "../../../../lib/money";
import { PO_LABEL, orderSteps } from "../../../../lib/status";
import { addAttachment, cancelPurchaseOrder, downloadAttachment, key, removeAttachment, submitPurchaseOrder, usePurchaseOrder } from "../../../../lib/queries";
import { DocLines } from "../../../../components/lines";
import { History } from "../../../../components/history";
import { CreditWarning, Failure, Loading, PageHead, StatusPill, Steps, TotalsBox } from "../../../../components/ui";

const EDITABLE = ["DRAFT", "SUBMITTED", "UNDER_REVIEW", "QUOTED", "NEGOTIATION"];

export default function PurchaseOrderPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const q = usePurchaseOrder(id);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string>();
  const [confirm, setConfirm] = React.useState(false);
  if (q.isLoading) return <Loading rows={6} />;
  if (q.isError || !q.data) return <Failure error={q.error} retry={() => q.refetch()} />;
  const po = q.data;
  const refresh = () => qc.invalidateQueries({ queryKey: key.all });
  const run = async (fn: () => Promise<unknown>) => { setBusy(true); setError(undefined); try { await fn(); await refresh(); setConfirm(false); } catch (e) { setError(e instanceof Error ? e.message : "That didn’t work."); } setBusy(false); };
  const cancellable = ["DRAFT", "SUBMITTED", "UNDER_REVIEW", "QUOTED", "NEGOTIATION"].includes(po.status);
  const canAttach = EDITABLE.includes(po.status);
  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (f) run(() => addAttachment(po.id, f));
  };

  return (
    <>
      <PageHead title={po.poNo} sub={<>{po.customerPoRef && <>Your ref {po.customerPoRef} · </>}Created {date(po.createdAt)}{po.requestedDeliveryDate && <> · Needed by {date(po.requestedDeliveryDate)}</>}</>} actions={<StatusPill map={PO_LABEL} status={po.status} />} />
      <div className="mb-5"><Steps steps={orderSteps({ po, quoted: !!po.quotationId })} /></div>
      {error && <p className="mb-3 text-danger" role="alert" data-testid="po-error">{error}</p>}
      {po.status === "APPROVED" && <p className="mb-4 rounded-md border border-success bg-success-subtle p-3 text-[0.8125rem] text-success" data-testid="approved-note">Approved at {money(po.approved?.totals.total ?? po.totals.total)}. We’re creating your sales order — it will appear here shortly.</p>}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section className="flex flex-col gap-4">
          <DocLines lines={(po.approved ?? po).lines} />
          {po.status === "DRAFT" && po.credit && <CreditWarning check={po.credit} />}
          {po.status === "SUBMITTED" && po.credit?.requiresApproval && <CreditWarning check={po.credit} />}
          <div className="card flex flex-col gap-3 p-4">
            <div className="flex items-center justify-between"><h2 className="font-semibold">Attachments ({po.attachments.length}/10)</h2>{canAttach && <label className="btn btn-outline btn-sm cursor-pointer"><Paperclip className="h-3.5 w-3.5" /> Attach<input type="file" className="hidden" onChange={onPick} data-testid="attach-file" /></label>}</div>
            {po.attachments.length === 0 ? <p className="text-[0.8125rem] text-muted">Nothing attached — PDF, PNG, JPEG, XLSX or CSV, up to 5 MB.</p> : (
              <ul className="flex flex-col gap-1.5" data-testid="attachment-list">
                {po.attachments.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-2 text-[0.8125rem]" data-testid="attachment-row">
                    <button type="button" className="min-w-0 truncate text-left underline-offset-2 hover:underline" onClick={() => downloadAttachment(po.id, a.id, a.name).catch((e) => setError(e instanceof Error ? e.message : "Couldn’t download that."))} data-testid="attachment-download">{a.name}</button>
                    <span className="flex shrink-0 items-center gap-2 text-[0.75rem] text-muted">{(a.size / 1024).toFixed(0)} KB · {a.uploadedBy === "CUSTOMER" ? "you" : "Suvarna"}
                      {a.uploadedBy === "CUSTOMER" && canAttach && <button type="button" className="text-muted hover:text-danger" aria-label={`Remove ${a.name}`} onClick={() => run(() => removeAttachment(po.id, a.id))} data-testid="attachment-remove"><X className="h-3.5 w-3.5" /></button>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="card p-4"><h2 className="mb-3 font-semibold">History</h2><History entries={po.history} /></div>
        </section>
        <aside className="flex flex-col gap-4">
          <div className="card flex flex-col gap-3 p-4">
            <TotalsBox taxable={(po.approved?.totals ?? po.totals).taxable} gst={(po.approved?.totals ?? po.totals).gst} total={(po.approved?.totals ?? po.totals).total} complete={po.totals.complete} testId="po-totals" />
            <p className="text-[0.75rem] text-muted">{po.approved ? "Fixed when approved." : "Indicative until we approve or quote it"}{po.submittedAt && <> · submitted {dateTime(po.submittedAt)}</>}.</p>
          </div>
          <div className="card p-4 text-[0.8125rem]">
            <p className="label mb-1">Ship to</p><p>{po.shippingAddress.line1}{po.shippingAddress.line2 && `, ${po.shippingAddress.line2}`}<br />{po.shippingAddress.city}, {po.shippingAddress.state} {po.shippingAddress.postalCode}</p>
            <p className="label mb-1 mt-3">Bill to</p><p>{po.billingAddress.line1}{po.billingAddress.line2 && `, ${po.billingAddress.line2}`}<br />{po.billingAddress.city}, {po.billingAddress.state} {po.billingAddress.postalCode}</p>
            {po.notes && <><p className="label mb-1 mt-3">Your notes</p><p>{po.notes}</p></>}
          </div>
          <div className="flex flex-col gap-2">
            {po.status === "DRAFT" && <button className="btn btn-primary h-10" disabled={busy} onClick={() => run(() => submitPurchaseOrder(po.id))} data-testid="submit-draft">Submit for review</button>}
            {po.quotationId && (po.status === "QUOTED" || po.status === "NEGOTIATION") && <Link href={`/quotations/${po.quotationId}`} className="btn btn-primary h-10" data-testid="view-quote">Review the quotation</Link>}
            {po.quotationId && !["QUOTED", "NEGOTIATION"].includes(po.status) && <Link href={`/quotations/${po.quotationId}`} className="btn btn-outline">View quotation</Link>}
            {po.salesOrderId && <Link href={`/orders/${po.salesOrderId}`} className="btn btn-outline" data-testid="view-order">View order</Link>}
            {cancellable && !confirm && <button className="btn btn-danger" onClick={() => setConfirm(true)} data-testid="cancel-po">Cancel this purchase order</button>}
            {confirm && <div className="card flex items-center justify-between gap-2 p-3" role="alertdialog" aria-label="Confirm cancel"><span>Cancel {po.poNo}?</span><span className="flex gap-2"><button className="btn btn-danger btn-sm" disabled={busy} onClick={() => run(() => cancelPurchaseOrder(po.id))} data-testid="confirm-cancel-po">Yes, cancel</button><button className="btn btn-ghost btn-sm" onClick={() => setConfirm(false)}>Keep</button></span></div>}
          </div>
        </aside>
      </div>
    </>
  );
}
