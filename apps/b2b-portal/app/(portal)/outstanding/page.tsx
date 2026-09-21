"use client";

import Link from "next/link";
import { date, money0 } from "../../../lib/money";
import { INVOICE_LABEL } from "../../../lib/status";
import { useOutstanding } from "../../../lib/queries";
import { Amount, CreditPanel, Empty, Failure, Loading, PageHead, Stat, StatusPill, TableWrap } from "../../../components/ui";

const BUCKETS: [keyof import("@jewellery/types").AgeingBuckets, string, string][] = [["current", "Not yet due", "bg-success"], ["days1to30", "1–30 days late", "bg-warning"], ["days31to60", "31–60 days", "bg-danger"], ["days61to90", "61–90 days", "bg-danger"], ["over90", "Over 90 days", "bg-danger"]];

export default function OutstandingPage() {
  const q = useOutstanding();
  if (q.isLoading) return <><PageHead title="Outstanding" /><Loading rows={6} /></>;
  if (q.isError || !q.data) return <Failure error={q.error} retry={() => q.refetch()} />;
  const { position: p, ageing, invoices, unappliedPayments, pendingPayments } = q.data;
  const total = Object.values(ageing).reduce((s, n) => s + n, 0);
  return (
    <>
      <PageHead title="Outstanding" sub="What you owe, how old it is, and how much credit you have left." actions={<Link href="/payments?report=1" className="btn btn-primary" data-testid="report-payment-cta">Report a payment</Link>} />
      <div className="mb-5 grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <div className="card p-5"><CreditPanel p={p} /></div>
        <div className="card p-5" data-testid="ageing"><h2 className="mb-3 font-semibold">Ageing</h2>
          {total === 0 ? <p className="text-muted">Nothing outstanding.</p> : <>
            <div className="mb-3 flex h-3 overflow-hidden rounded-full bg-surface-sunken" role="img" aria-label="Outstanding by age">{BUCKETS.map(([k, , c]) => ageing[k] ? <div key={k} className={c} style={{ width: `${(ageing[k] / total) * 100}%` }} /> : null)}</div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[0.8125rem]">{BUCKETS.map(([k, label, c]) => <div key={k} className="flex justify-between gap-2"><dt className="flex items-center gap-1.5 text-muted"><i className={`inline-block h-2 w-2 rounded-full ${c}`} />{label}</dt><dd className="num font-medium" data-testid={`age-${k}`}>{money0(ageing[k])}</dd></div>)}</dl></>}
        </div>
      </div>
      {(unappliedPayments > 0 || pendingPayments > 0) && (
        <div className="mb-5 grid gap-3 sm:grid-cols-2">
          {pendingPayments > 0 && <Stat label="Payments awaiting verification" value={money0(pendingPayments)} sub="Counted once we confirm them" testId="pending-payments" />}
          {unappliedPayments > 0 && <Stat label="Verified, not yet applied" value={money0(unappliedPayments)} sub="We’ll apply it to your invoices" testId="unapplied-payments" />}
        </div>
      )}
      <h2 className="mb-2 font-semibold">Unpaid invoices</h2>
      {invoices.length === 0 ? <Empty title="You’re all paid up" /> : (
        <TableWrap><table className="tbl" data-testid="outstanding-table"><thead><tr><th>Invoice</th><th>Due</th><th>Status</th><th className="text-right">Total</th><th className="text-right">Paid</th><th className="text-right">Balance</th></tr></thead><tbody>
          {invoices.map((i) => <tr key={i.id} data-testid="outstanding-row" className={i.status === "OVERDUE" ? "bg-danger-subtle" : undefined}><td><Link className="font-medium underline-offset-2 hover:underline" href={`/invoices/${i.id}`}>{i.invoiceNo}</Link></td><td>{date(i.dueDate)}{i.daysOverdue > 0 && <span className="ml-1 text-danger">({i.daysOverdue} days late)</span>}</td><td><StatusPill map={INVOICE_LABEL} status={i.status} /></td><td className="text-right"><Amount v={i.totals.total} /></td><td className="text-right"><Amount v={i.paid} /></td><td className="text-right"><Amount v={i.balance} strong /></td></tr>)}
        </tbody></table></TableWrap>
      )}
    </>
  );
}
