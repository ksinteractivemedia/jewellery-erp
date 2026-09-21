"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { date } from "../../../../lib/money";
import { SO_LABEL, orderSteps } from "../../../../lib/status";
import { useInvoice, useOrder } from "../../../../lib/queries";
import { DocLines } from "../../../../components/lines";
import { History } from "../../../../components/history";
import { CreditWarning, Failure, Loading, PageHead, StatusPill, Steps, TotalsBox } from "../../../../components/ui";

export default function OrderPage() {
  const { id } = useParams<{ id: string }>();
  const q = useOrder(id);
  const inv = useInvoice(q.data?.invoiceId ?? "");
  if (q.isLoading) return <Loading rows={6} />;
  if (q.isError || !q.data) return <Failure error={q.error} retry={() => q.refetch()} />;
  const o = q.data;
  const held = o.status === "PENDING_CREDIT_APPROVAL";

  return (
    <>
      <PageHead title={o.soNo} sub={<>From <Link className="underline underline-offset-2" href={`/purchase-orders/${o.purchaseOrderId}`}>{o.poNo}</Link>{o.customerPoRef && <> · your ref {o.customerPoRef}</>} · placed {date(o.createdAt)}</>} actions={<StatusPill map={SO_LABEL} status={o.status} />} />
      <div className="mb-5"><Steps steps={orderSteps({ quoted: !!o.quotationId, order: o, ...(inv.data ? { invoice: inv.data } : {}) })} /></div>
      {held && (
        <div className="mb-5 flex flex-col gap-3" data-testid="credit-hold">
          <CreditWarning held check={{ ...o.credit.check, requiresApproval: true }} />
          <p className="text-[0.8125rem] text-muted">Your order is safely with us. It stays on hold — no stock is set aside — until our credit team approves it or your account is back within terms. <Link href="/outstanding" className="underline underline-offset-2">See what’s outstanding</Link>.</p>
        </div>
      )}
      {o.credit.override && <p className="mb-4 rounded-md border border-border bg-surface-sunken p-3 text-[0.8125rem] text-muted" data-testid="override-note">Approved by our credit team above your usual limit.</p>}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section className="flex flex-col gap-4">
          <DocLines lines={o.lines} />
          <div className="card p-4"><h2 className="mb-3 font-semibold">History</h2><History entries={o.history} /></div>
        </section>
        <aside className="flex flex-col gap-4">
          <div className="card flex flex-col gap-3 p-4"><TotalsBox taxable={o.totals.taxable} gst={o.totals.gst} total={o.totals.total} testId="order-totals" /><p className="text-[0.75rem] text-muted">Prices are fixed as approved — they don’t follow the metal rate.</p></div>
          {o.invoiceId && <Link href={`/invoices/${o.invoiceId}`} className="btn btn-primary h-10" data-testid="view-invoice">View invoice {o.invoiceNo}</Link>}
          {o.status === "APPROVED" && <p className="rounded-md border border-border-subtle p-3 text-[0.8125rem] text-muted">Approved. We’re allocating stock for this order{o.shortfall?.length ? " — some items are being sourced" : ""}.</p>}
          <div className="card p-4 text-[0.8125rem]"><p className="label mb-1">Ship to</p><p>{o.shippingAddress.line1}<br />{o.shippingAddress.city}, {o.shippingAddress.state} {o.shippingAddress.postalCode}</p></div>
        </aside>
      </div>
    </>
  );
}
