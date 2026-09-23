"use client";

import * as React from "react";
import Link from "next/link";
import { date, money } from "../../../lib/money";
import { SO_LABEL } from "../../../lib/status";
import { useOrders } from "../../../lib/queries";
import { Empty, Failure, Loading, PageHead, StatusPill, TableWrap } from "../../../components/ui";

export default function OrdersPage() {
  const q = useOrders();
  return (
    <>
      <PageHead title="Orders" sub="Approved orders: stock allocation, invoicing and settlement." />
      {q.isError ? <Failure error={q.error} retry={() => q.refetch()} /> : q.isLoading ? <Loading /> : (q.data ?? []).length === 0 ? <Empty title="No orders yet" hint="An order is created when we approve your purchase order, or when you accept a quotation." /> : (
        <TableWrap><table className="tbl" data-testid="order-table"><thead><tr><th>Order</th><th>PO</th><th>Your ref</th><th>Placed</th><th className="text-right">Total</th><th>Status</th><th>Invoices</th></tr></thead><tbody>
          {q.data!.map((o) => <tr key={o.id} data-testid="order-row"><td><Link className="font-medium underline-offset-2 hover:underline" href={`/orders/${o.id}`}>{o.soNo}</Link></td><td>{o.poNo}</td><td className="text-muted">{o.customerPoRef ?? "—"}</td><td>{date(o.createdAt)}</td><td className="num text-right">{money(o.totals.total)}</td><td><StatusPill map={SO_LABEL} status={o.status} /></td><td>{o.invoices.length ? o.invoices.map((i, idx) => <React.Fragment key={i.id}>{idx > 0 && ", "}<Link className="underline underline-offset-2" href={`/invoices/${i.id}`}>{i.invoiceNo}</Link></React.Fragment>) : <span className="text-muted">—</span>}</td></tr>)}
        </tbody></table></TableWrap>
      )}
    </>
  );
}
