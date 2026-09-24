"use client";

import * as React from "react";
import Link from "next/link";
import { date, money0 } from "../../../lib/money";
import { INVOICE_LABEL } from "../../../lib/status";
import { useInvoices } from "../../../lib/queries";
import { Amount, Empty, Failure, Loading, PageHead, Stat, StatusPill, TableWrap } from "../../../components/ui";

const TABS: [string, string, string[] | null][] = [["all", "All", null], ["unpaid", "Unpaid", ["UNPAID", "PARTIALLY_PAID", "OVERDUE"]], ["overdue", "Overdue", ["OVERDUE"]], ["paid", "Paid", ["PAID"]]];

export default function InvoicesPage() {
  const q = useInvoices();
  const [t, setT] = React.useState("all");
  const all = q.data ?? [];
  const set = TABS.find((x) => x[0] === t)![2];
  const items = all.filter((i) => !set || set.includes(i.status));
  const owed = all.reduce((s, i) => s + i.balance, 0);
  return (
    <>
      <PageHead title="Invoices" sub="Tax invoices for your orders. What you’ve paid is the sum of payments we’ve verified and applied." />
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3"><Stat label="Invoices" value={all.length} /><Stat label="Balance owing" value={money0(owed)} testId="inv-owed" /><Stat label="Overdue" value={all.filter((i) => i.status === "OVERDUE").length} tone={all.some((i) => i.status === "OVERDUE") ? "bad" : undefined} /></div>
      <div className="mb-3 flex gap-1.5" role="tablist" aria-label="Filter">{TABS.map(([id, label]) => <button key={id} role="tab" aria-selected={t === id} className={`chip h-8 px-3 text-[0.75rem] ${t === id ? "border-foreground bg-foreground text-background" : "bg-surface"}`} onClick={() => setT(id)} data-testid={`tab-${id}`}>{label}</button>)}</div>
      {q.isError ? <Failure error={q.error} retry={() => q.refetch()} /> : q.isLoading ? <Loading /> : items.length === 0 ? <Empty title="No invoices here" hint={t === "all" ? "An invoice appears once we've fulfilled and billed an order." : "Try a different filter."} /> : (
        <TableWrap><table className="tbl" data-testid="invoice-table"><thead><tr><th>Invoice</th><th>Order</th><th>Issued</th><th>Due</th><th className="text-right">Total</th><th className="text-right">Paid</th><th className="text-right">Balance</th><th>Status</th></tr></thead><tbody>
          {items.map((i) => <tr key={i.id} data-testid="invoice-row"><td><Link className="font-medium underline-offset-2 hover:underline" href={`/invoices/${i.id}`}>{i.invoiceNo}</Link></td><td>{i.soNo}</td><td>{date(i.issueDate)}</td><td>{date(i.dueDate)}{i.daysOverdue > 0 && <span className="ml-1 text-danger">({i.daysOverdue}d)</span>}</td><td className="text-right"><Amount v={i.totals.total} /></td><td className="text-right"><Amount v={i.paid} /></td><td className="text-right"><Amount v={i.balance} strong /></td><td><StatusPill map={INVOICE_LABEL} status={i.status} /></td></tr>)}
        </tbody></table></TableWrap>
      )}
    </>
  );
}
