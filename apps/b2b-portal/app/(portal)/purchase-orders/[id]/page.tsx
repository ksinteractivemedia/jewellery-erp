"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { date, dateTime } from "../../../../lib/money";
import { PO_LABEL, orderSteps } from "../../../../lib/status";
import { cancelPurchaseOrder, key, submitPurchaseOrder, usePurchaseOrder } from "../../../../lib/queries";
import { DocLines } from "../../../../components/lines";
import { History } from "../../../../components/history";
import { CreditWarning, Failure, Loading, PageHead, StatusPill, Steps, TotalsBox } from "../../../../components/ui";

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
  const cancellable = ["DRAFT", "SUBMITTED", "UNDER_REVIEW", "QUOTED", "NEGOTIATING"].includes(po.status);

  return (
    <>
      <PageHead title={po.poNo} sub={<>{po.customerPoRef && <>Your ref {po.customerPoRef} · </>}Created {date(po.createdAt)}{po.requestedDeliveryDate && <> · Needed by {date(po.requestedDeliveryDate)}</>}</>} actions={<StatusPill map={PO_LABEL} status={po.status} />} />
      <div className="mb-5"><Steps steps={orderSteps({ po, quoted: !!po.quotationId, ...(po.salesOrderId ? { order: { status: "APPROVED" as const } } : {}) })} /></div>
      {error && <p className="mb-3 text-danger" role="alert" data-testid="po-error">{error}</p>}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section className="flex flex-col gap-4">
          <DocLines lines={po.lines} />
          {po.status === "DRAFT" && po.credit && <CreditWarning check={po.credit} />}
          {po.status === "SUBMITTED" && po.credit?.requiresApproval && <CreditWarning check={po.credit} />}
          <div className="card p-4"><h2 className="mb-3 font-semibold">History</h2><History entries={po.history} /></div>
        </section>
        <aside className="flex flex-col gap-4">
          <div className="card flex flex-col gap-3 p-4">
            <TotalsBox taxable={po.totals.taxable} gst={po.totals.gst} total={po.totals.total} complete={po.totals.complete} testId="po-totals" />
            <p className="text-[0.75rem] text-muted">Indicative until we approve or quote it{po.submittedAt && <> · submitted {dateTime(po.submittedAt)}</>}.</p>
          </div>
          <div className="card p-4 text-[0.8125rem]"><p className="label mb-1">Ship to</p><p>{po.shippingAddress.line1}{po.shippingAddress.line2 && `, ${po.shippingAddress.line2}`}<br />{po.shippingAddress.city}, {po.shippingAddress.state} {po.shippingAddress.postalCode}</p>{po.notes && <><p className="label mb-1 mt-3">Your notes</p><p>{po.notes}</p></>}</div>
          <div className="flex flex-col gap-2">
            {po.status === "DRAFT" && <button className="btn btn-primary h-10" disabled={busy} onClick={() => run(() => submitPurchaseOrder(po.id))} data-testid="submit-draft">Submit for review</button>}
            {po.quotationId && po.status === "QUOTED" && <Link href={`/quotations/${po.quotationId}`} className="btn btn-primary h-10" data-testid="view-quote">Review the quotation</Link>}
            {po.quotationId && po.status !== "QUOTED" && <Link href={`/quotations/${po.quotationId}`} className="btn btn-outline">View quotation</Link>}
            {po.salesOrderId && <Link href={`/orders/${po.salesOrderId}`} className="btn btn-outline" data-testid="view-order">View order</Link>}
            {cancellable && !confirm && <button className="btn btn-danger" onClick={() => setConfirm(true)} data-testid="cancel-po">Cancel this purchase order</button>}
            {confirm && <div className="card flex items-center justify-between gap-2 p-3" role="alertdialog" aria-label="Confirm cancel"><span>Cancel {po.poNo}?</span><span className="flex gap-2"><button className="btn btn-danger btn-sm" disabled={busy} onClick={() => run(() => cancelPurchaseOrder(po.id))} data-testid="confirm-cancel-po">Yes, cancel</button><button className="btn btn-ghost btn-sm" onClick={() => setConfirm(false)}>Keep</button></span></div>}
          </div>
        </aside>
      </div>
    </>
  );
}
