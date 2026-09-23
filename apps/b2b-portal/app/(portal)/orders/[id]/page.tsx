"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { date, money } from "../../../../lib/money";
import { SO_LABEL, orderSteps } from "../../../../lib/status";
import { useInvoice, useOrder } from "../../../../lib/queries";
import { DocLines } from "../../../../components/lines";
import { History } from "../../../../components/history";
import { ReturnsSection } from "../../../../components/returns-section";
import { CreditWarning, Failure, Loading, PageHead, StatusPill, Steps, TotalsBox } from "../../../../components/ui";

export default function OrderPage() {
  const { id } = useParams<{ id: string }>();
  const q = useOrder(id);
  const latestInvoiceId = q.data?.invoices.at(-1)?.id ?? "";
  const inv = useInvoice(latestInvoiceId);
  if (q.isLoading) return <Loading rows={6} />;
  if (q.isError || !q.data) return <Failure error={q.error} retry={() => q.refetch()} />;
  const o = q.data;
  const held = o.status === "DRAFT";

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
      {!!o.shortfall?.length && <p className="mb-4 rounded-md border border-warning bg-warning-subtle p-3 text-[0.8125rem] text-warning" data-testid="shortfall">Part of this order is still being sourced: {o.shortfall.map((s) => `${s.sku} (${s.available} of ${s.wanted} in stock)`).join(", ")}. The rest has been allocated.</p>}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section className="flex flex-col gap-4">
          <DocLines lines={o.lines} />
          <div className="card overflow-x-auto p-4">
            <h2 className="mb-3 font-semibold">Fulfilment progress</h2>
            <table className="tbl" data-testid="order-progress"><thead><tr><th>SKU</th><th className="text-right">Ordered</th><th className="text-right">Allocated</th><th className="text-right">Invoiced</th></tr></thead><tbody>
              {o.progress.map((p) => <tr key={p.sku}><td className="num">{p.sku}</td><td className="num text-right">{p.quantity}</td><td className="num text-right">{p.allocated}</td><td className="num text-right">{p.invoiced}</td></tr>)}
            </tbody></table>
          </div>
          <div className="card p-4"><h2 className="mb-3 font-semibold">History</h2><History entries={o.history} /></div>
          <ReturnsSection order={o} />
        </section>
        <aside className="flex flex-col gap-4">
          <div className="card flex flex-col gap-3 p-4"><TotalsBox taxable={o.totals.taxable} gst={o.totals.gst} total={o.totals.total} testId="order-totals" /><p className="text-[0.75rem] text-muted">Prices are fixed as approved — they don’t follow the metal rate.</p></div>
          {o.invoices.length > 0 && (
            <div className="card flex flex-col gap-2 p-4" data-testid="order-invoices">
              <p className="label">{o.invoices.length > 1 ? `${o.invoices.length} invoices` : "Invoice"}</p>
              {o.invoices.map((i) => <Link key={i.id} href={`/invoices/${i.id}`} className="flex items-center justify-between text-[0.8125rem] underline-offset-2 hover:underline"><span>{i.invoiceNo}</span><span className="num">{money(i.total)}</span></Link>)}
            </div>
          )}
          {["CONFIRMED", "PARTIALLY_ALLOCATED"].includes(o.status) && <p className="rounded-md border border-border-subtle p-3 text-[0.8125rem] text-muted">We’re allocating stock for this order{o.shortfall?.length ? " — some items are being sourced" : ""}.</p>}
          <div className="card p-4 text-[0.8125rem]">
            <p className="label mb-1">Ship to</p><p>{o.shippingAddress.line1}<br />{o.shippingAddress.city}, {o.shippingAddress.state} {o.shippingAddress.postalCode}</p>
            <p className="label mb-1 mt-3">Bill to</p><p>{o.billingAddress.line1}<br />{o.billingAddress.city}, {o.billingAddress.state} {o.billingAddress.postalCode}</p>
          </div>
        </aside>
      </div>
    </>
  );
}
