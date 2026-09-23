"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { PageHeader } from "@jewellery/ui";
import { usePurchaseDashboard } from "../../lib/api/purchasing";
import { Load, Status, Table, Td, Th, day, money, money0 } from "./shared";

function Stat({ label, value, tone }: { label: string; value: ReactNode; tone?: "danger" | "warning" }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <p className="text-body-sm text-muted">{label}</p>
      <p className={`mt-1 text-h3 font-display tabular ${tone === "danger" ? "text-danger" : tone === "warning" ? "text-warning" : "text-foreground"}`} data-testid={`stat-${label}`}>{value}</p>
    </div>
  );
}

export function PurchaseDashboardView() {
  const q = usePurchaseDashboard();
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Purchasing" description="Requisitions, purchase orders, goods receipts and what's owed to suppliers." />
      <Load q={q} rows={8}>
      {q.data && (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <Stat label="Open requisitions" value={q.data.counts.openRequisitions} />
            <Stat label="Open purchase orders" value={q.data.counts.openPurchaseOrders} />
            <Stat label="Awaiting receipt" value={q.data.counts.pendingReceipt} tone={q.data.counts.pendingReceipt ? "warning" : undefined} />
            <Stat label="Unpaid invoices" value={q.data.counts.unpaidInvoices} />
            <Stat label="Overdue invoices" value={q.data.counts.overdueInvoices} tone={q.data.counts.overdueInvoices ? "danger" : undefined} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-border bg-surface p-4"><p className="text-body-sm text-muted">Total owed to suppliers</p><p className="mt-1 text-h3 font-display tabular">{money0(q.data.payables.totalOwed)}</p></div>
            <div className="rounded-lg border border-border bg-surface p-4"><p className="text-body-sm text-muted">Of which overdue</p><p className={`mt-1 text-h3 font-display tabular ${q.data.payables.overdue ? "text-danger" : ""}`}>{money0(q.data.payables.overdue)}</p></div>
          </div>
          <div className="flex flex-col gap-2">
            <h3 className="font-semibold">Recent purchase orders</h3>
            <Table testId="dash-recent-pos"><thead><tr><Th>PO</Th><Th>Supplier</Th><Th right>Total</Th><Th>Status</Th></tr></thead><tbody>
              {q.data.recentPurchaseOrders.map((p) => <tr key={p.id}><Td className="font-medium"><Link className="hover:underline" href="/purchasing/purchase-orders">{p.poNo}</Link></Td><Td>{p.supplier.name}</Td><Td right>{money(p.totals.total)}</Td><Td><Status s={p.status} /></Td></tr>)}
            </tbody></Table>
          </div>
          <div className="flex flex-col gap-2">
            <h3 className="font-semibold">Recent goods receipts</h3>
            <Table testId="dash-recent-grns"><thead><tr><Th>GRN</Th><Th>PO</Th><Th>Received</Th><Th right>Lines</Th></tr></thead><tbody>
              {q.data.recentGoodsReceipts.map((g) => <tr key={g.id}><Td className="font-medium">{g.grnNo}</Td><Td>{g.poNo}</Td><Td>{day(g.receivedDate)}</Td><Td right>{g.lines.length}</Td></tr>)}
            </tbody></Table>
          </div>
        </div>
      )}
      </Load>
    </div>
  );
}
