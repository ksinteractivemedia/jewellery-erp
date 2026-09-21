"use client";

import Link from "next/link";
import { AlertTriangle, ArrowRight, Clock } from "lucide-react";
import { date, money0 } from "../../lib/money";
import { INVOICE_LABEL, SO_LABEL } from "../../lib/status";
import { useDashboard } from "../../lib/queries";
import { Amount, CreditPanel, Empty, Failure, Loading, PageHead, Stat, StatusPill, TableWrap } from "../../components/ui";

export default function DashboardPage() {
  const q = useDashboard();
  if (q.isLoading) return <><PageHead title="Dashboard" /><Loading rows={6} /></>;
  if (q.isError || !q.data) return <Failure error={q.error} retry={() => q.refetch()} />;
  const { account, counts, actions, recentOrders, dueSoon } = q.data;
  const p = account.position;

  return (
    <>
      <PageHead title="Dashboard" sub={<>{account.customer.name}{account.salesperson && <> · Your salesperson: <strong className="font-medium text-foreground">{account.salesperson.name}</strong></>}{account.profile.territory && <> · {account.profile.territory}</>}</>} actions={<><Link href="/quick-order" className="btn btn-primary" data-testid="dash-quick-order">Quick order</Link><Link href="/catalogue" className="btn btn-outline">Browse catalogue</Link></>} />

      {actions.length > 0 && (
        <ul className="mb-5 flex flex-col gap-2" aria-label="Needs your attention" data-testid="dash-actions">
          {actions.map((a) => (
            <li key={a.message}><Link href={a.href} className="card flex items-center justify-between gap-3 px-4 py-3 hover:border-foreground"><span className="flex items-center gap-2.5">{a.kind === "OVERDUE" || a.kind === "CREDIT" ? <AlertTriangle className="h-4 w-4 text-danger" aria-hidden="true" /> : <Clock className="h-4 w-4 text-warning" aria-hidden="true" />}{a.message}</span><ArrowRight className="h-4 w-4 text-muted" aria-hidden="true" /></Link></li>
          ))}
        </ul>
      )}

      <section className="mb-5 grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]" aria-label="Credit and activity">
        <div className="card p-5"><h2 className="mb-3 font-semibold">Credit account</h2><CreditPanel p={p} /><p className="mt-3 text-[0.75rem] text-muted">Payment terms: net {account.profile.paymentTermsDays} days{account.priceList && <> · Price list: {account.priceList.name}</>}</p></div>
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Open purchase orders" value={counts.openPurchaseOrders} href="/purchase-orders" testId="stat-pos" />
          <Stat label="Quotations to answer" value={counts.quotationsAwaitingYou} href="/quotations" tone={counts.quotationsAwaitingYou ? "bad" : undefined} testId="stat-quotes" />
          <Stat label="Orders in progress" value={counts.ordersInProgress} href="/orders" testId="stat-orders" />
          <Stat label="Unpaid invoices" value={counts.unpaidInvoices} sub={counts.overdueInvoices ? `${counts.overdueInvoices} overdue` : "None overdue"} href="/invoices" tone={counts.overdueInvoices ? "bad" : undefined} testId="stat-invoices" />
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-2">
        <section aria-labelledby="recent-h">
          <div className="mb-2 flex items-center justify-between"><h2 id="recent-h" className="font-semibold">Recent orders</h2><Link href="/orders" className="text-[0.75rem] text-muted hover:text-foreground">All orders</Link></div>
          {recentOrders.length === 0 ? <Empty title="No orders yet" hint="Place your first order from the catalogue or with Quick order." /> : (
            <TableWrap><table className="tbl" data-testid="recent-orders"><thead><tr><th>Order</th><th>PO ref</th><th>Status</th><th className="text-right">Total</th></tr></thead><tbody>
              {recentOrders.map((o) => <tr key={o.id}><td><Link className="font-medium underline-offset-2 hover:underline" href={`/orders/${o.id}`}>{o.soNo}</Link></td><td className="text-muted">{o.customerPoRef ?? o.poNo}</td><td><StatusPill map={SO_LABEL} status={o.status} /></td><td className="text-right"><Amount v={o.totals.total} /></td></tr>)}
            </tbody></table></TableWrap>
          )}
        </section>
        <section aria-labelledby="due-h">
          <div className="mb-2 flex items-center justify-between"><h2 id="due-h" className="font-semibold">Invoices to pay</h2><Link href="/outstanding" className="text-[0.75rem] text-muted hover:text-foreground">Outstanding</Link></div>
          {dueSoon.length === 0 ? <Empty title="Nothing owing" hint="Every invoice is paid." /> : (
            <TableWrap><table className="tbl" data-testid="due-soon"><thead><tr><th>Invoice</th><th>Due</th><th>Status</th><th className="text-right">Balance</th></tr></thead><tbody>
              {dueSoon.map((i) => <tr key={i.id}><td><Link className="font-medium underline-offset-2 hover:underline" href={`/invoices/${i.id}`}>{i.invoiceNo}</Link></td><td>{date(i.dueDate)}{i.daysOverdue > 0 && <span className="ml-1 text-danger">({i.daysOverdue}d late)</span>}</td><td><StatusPill map={INVOICE_LABEL} status={i.status} /></td><td className="text-right"><Amount v={i.balance} strong /></td></tr>)}
            </tbody></table></TableWrap>
          )}
          <p className="mt-2 text-[0.75rem] text-muted">Outstanding {money0(p.outstanding)} · Overdue {money0(p.overdue)}</p>
        </section>
      </div>
    </>
  );
}
