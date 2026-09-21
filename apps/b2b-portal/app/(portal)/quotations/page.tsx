"use client";

import Link from "next/link";
import { date, money } from "../../../lib/money";
import { QUOTE_LABEL } from "../../../lib/status";
import { useQuotations } from "../../../lib/queries";
import { Empty, Failure, Loading, PageHead, StatusPill, TableWrap } from "../../../components/ui";

export default function QuotationsPage() {
  const q = useQuotations();
  return (
    <>
      <PageHead title="Quotations" sub="Prices we’ve quoted for your purchase orders. Accept, ask for changes, or decline." />
      {q.isError ? <Failure error={q.error} retry={() => q.refetch()} /> : q.isLoading ? <Loading /> : (q.data ?? []).length === 0 ? <Empty title="No quotations" hint="When we quote one of your purchase orders — a price on request, or a negotiated price — it appears here." /> : (
        <TableWrap><table className="tbl" data-testid="quote-table"><thead><tr><th>Quotation</th><th>For PO</th><th className="text-right">Version</th><th>Valid until</th><th className="text-right">Total</th><th>Status</th></tr></thead><tbody>
          {q.data!.map((x) => <tr key={x.id} data-testid="quote-row"><td><Link className="font-medium underline-offset-2 hover:underline" href={`/quotations/${x.id}`}>{x.quoteNo}</Link></td><td>{x.poNo}</td><td className="num text-right">v{x.version}</td><td>{date(x.validUntil)}</td><td className="num text-right">{money(x.totals.total)}</td><td><StatusPill map={QUOTE_LABEL} status={x.status} /></td></tr>)}
        </tbody></table></TableWrap>
      )}
    </>
  );
}
