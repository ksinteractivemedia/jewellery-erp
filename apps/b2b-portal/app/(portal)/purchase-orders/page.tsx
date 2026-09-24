"use client";

import * as React from "react";
import Link from "next/link";
import { date, money } from "../../../lib/money";
import { PO_LABEL } from "../../../lib/status";
import { usePurchaseOrders } from "../../../lib/queries";
import { Empty, Failure, Loading, PageHead, StatusPill, TableWrap } from "../../../components/ui";

const GROUPS: [string, string, string[] | null][] = [["all", "All", null], ["open", "Open", ["DRAFT", "SUBMITTED", "UNDER_REVIEW", "QUOTED", "NEGOTIATION"]], ["approved", "Approved / placed", ["APPROVED", "CONVERTED"]], ["closed", "Closed", ["REJECTED", "EXPIRED", "CANCELLED"]]];

export default function PurchaseOrdersPage() {
  const q = usePurchaseOrders();
  const [g, setG] = React.useState("all");
  const set = GROUPS.find((x) => x[0] === g)![2];
  const items = (q.data ?? []).filter((p) => !set || set.includes(p.status));
  return (
    <>
      <PageHead title="Purchase orders" sub="Every order you’ve sent us, from draft to approval." actions={<Link href="/quick-order" className="btn btn-primary">New purchase order</Link>} />
      <div className="mb-3 flex gap-1.5" role="tablist" aria-label="Filter">{GROUPS.map(([id, label]) => <button key={id} role="tab" aria-selected={g === id} className={`chip h-8 px-3 text-[0.75rem] ${g === id ? "border-foreground bg-foreground text-background" : "bg-surface"}`} onClick={() => setG(id)} data-testid={`tab-${id}`}>{label}</button>)}</div>
      {q.isError ? <Failure error={q.error} retry={() => q.refetch()} /> : q.isLoading ? <Loading /> : items.length === 0 ? <Empty title="No purchase orders here" hint="Orders you submit appear in this list." action={<Link href="/catalogue" className="btn btn-outline">Browse the catalogue</Link>} /> : (
        <TableWrap><table className="tbl" data-testid="po-table"><thead><tr><th>PO</th><th>Your ref</th><th>Created</th><th className="text-right">Lines</th><th className="text-right">Total</th><th>Status</th></tr></thead><tbody>
          {items.map((p) => <tr key={p.id} data-testid="po-row"><td><Link className="font-medium underline-offset-2 hover:underline" href={`/purchase-orders/${p.id}`}>{p.poNo}</Link></td><td className="text-muted">{p.customerPoRef ?? "—"}</td><td>{date(p.createdAt)}</td><td className="num text-right">{p.lines.length}</td><td className="num text-right">{money(p.totals.total)}{!p.totals.complete && <span className="ml-1 text-warning" title="Some lines are price on request">+</span>}</td><td><StatusPill map={PO_LABEL} status={p.status} /></td></tr>)}
        </tbody></table></TableWrap>
      )}
    </>
  );
}
