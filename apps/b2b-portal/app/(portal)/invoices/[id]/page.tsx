"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Printer } from "lucide-react";
import { date, money } from "../../../../lib/money";
import { INVOICE_LABEL, METHOD_LABEL } from "../../../../lib/status";
import { useInvoice } from "../../../../lib/queries";
import { DocLines } from "../../../../components/lines";
import { Failure, Loading, PageHead, StatusPill, TotalsBox } from "../../../../components/ui";

export default function InvoicePage() {
  const { id } = useParams<{ id: string }>();
  const q = useInvoice(id);
  if (q.isLoading) return <Loading rows={6} />;
  if (q.isError || !q.data) return <Failure error={q.error} retry={() => q.refetch()} />;
  const inv = q.data;
  const t = inv.taxes;
  return (
    <>
      <PageHead title={`Invoice ${inv.invoiceNo}`} sub={<>Order <Link className="underline underline-offset-2" href={`/orders/${inv.salesOrderId}`}>{inv.soNo}</Link>{inv.sequence > 1 && <> · invoice #{inv.sequence} for this order</>} · issued {date(inv.issueDate)} · due {date(inv.dueDate)}</>} actions={<><StatusPill map={INVOICE_LABEL} status={inv.status} /><button className="btn btn-outline btn-sm print:hidden" onClick={() => window.print()} data-testid="print"><Printer className="h-4 w-4" aria-hidden="true" />Print</button></>} />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section className="flex flex-col gap-4">
          {/* The invoice's OWN frozen billing address — not the account's current one, which may since have changed. */}
          <div className="card grid gap-4 p-4 text-[0.8125rem] sm:grid-cols-2"><div><p className="label mb-1">Billed to</p><p className="font-medium">{inv.customer.name}</p>{inv.customer.gstin && <p className="text-muted">GSTIN {inv.customer.gstin}</p>}<p>{inv.billingAddress.line1}, {inv.billingAddress.city}, {inv.billingAddress.state} {inv.billingAddress.postalCode}</p></div><div><p className="label mb-1">Ship to</p><p>{inv.shippingAddress.line1}<br />{inv.shippingAddress.city}, {inv.shippingAddress.state} {inv.shippingAddress.postalCode}</p></div></div>
          <DocLines lines={inv.lines} testId="invoice-lines" />
          <div className="card p-4"><h2 className="mb-2 font-semibold">Payments applied</h2>
            {inv.allocations.length === 0 ? <p className="text-muted" data-testid="no-allocations">No payment has been applied to this invoice yet.</p> : <table className="tbl" data-testid="allocations"><thead><tr><th>Payment</th><th>Method</th><th>Reference</th><th>Applied</th><th className="text-right">Amount</th></tr></thead><tbody>{inv.allocations.map((a, i) => <tr key={i}><td>{a.paymentNo}</td><td>{METHOD_LABEL[a.method]}</td><td className="text-muted">{a.reference ?? "—"}</td><td>{date(a.at)}</td><td className="num text-right">{money(a.amount)}</td></tr>)}</tbody></table>}
          </div>
        </section>
        <aside className="flex flex-col gap-4">
          <div className="card flex flex-col gap-3 p-4">
            <TotalsBox taxable={inv.totals.taxable} gst={inv.totals.gst} total={inv.totals.total} testId="invoice-totals" />
            <dl className="flex flex-col gap-1 border-t border-border-subtle pt-3 text-[0.8125rem]" data-testid="tax-split">
              {t.supplyType === "INTRA_STATE" ? <><div className="flex justify-between"><dt className="text-muted">CGST</dt><dd className="num">{money(t.cgst)}</dd></div><div className="flex justify-between"><dt className="text-muted">SGST</dt><dd className="num">{money(t.sgst)}</dd></div></> : <div className="flex justify-between"><dt className="text-muted">IGST</dt><dd className="num">{money(t.igst)}</dd></div>}
            </dl>
            <dl className="flex flex-col gap-1 border-t border-border-subtle pt-3 text-[0.8125rem]"><div className="flex justify-between"><dt className="text-muted">Paid</dt><dd className="num" data-testid="inv-paid">{money(inv.paid)}</dd></div><div className="flex justify-between font-semibold"><dt>Balance</dt><dd className="num" data-testid="inv-balance">{money(inv.balance)}</dd></div></dl>
          </div>
          {inv.balance > 0 && <Link href="/payments?report=1" className="btn btn-primary h-10 print:hidden" data-testid="report-payment-link">I’ve paid this — report a payment</Link>}
        </aside>
      </div>
    </>
  );
}
