"use client";

import * as React from "react";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { EmptyState, PageHeader } from "@jewellery/ui";
import { useAgeing, useOutstanding, useReceivablesDashboard } from "../../lib/api/accounting";
import { Load, Stat, Status, Table, Td, Th, day, rupees } from "./shared";

const BUCKETS: [key: "current" | "days1to30" | "days31to60" | "days61to90" | "over90", label: string][] = [
  ["current", "Current"],
  ["days1to30", "1–30 days"],
  ["days31to60", "31–60 days"],
  ["days61to90", "61–90 days"],
  ["over90", "90+ days"],
];

/**
 * Accounts Receivable, as the accounts team needs to see it: what's outstanding, how much of it is
 * overdue, aged into buckets, and every open invoice behind the total. Every number here is the
 * API's (`receivables-reads.service.ts`) — nothing is computed in this component (the task's own
 * instruction, and CLAUDE.md rule 4). Payment allocation itself stays on the B2B desk's own
 * Invoices & Payments screen, already built in Phase 4b — linked from here, not duplicated.
 */
export function ReceivablesView() {
  const dash = useReceivablesDashboard();
  const ageing = useAgeing();
  const out = useOutstanding();
  const [customerFilter, setCustomerFilter] = React.useState<string>("");

  const rows = (out.data ?? []).filter((r) => !customerFilter || r.customerName.toLowerCase().includes(customerFilter.toLowerCase()));

  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="Receivables" description="What customers owe, aged against their due date — the accounts team's own view, across every B2B customer." actions={<Link href="/b2b/outstanding" className="text-body-sm underline underline-offset-2">Record or allocate a payment →</Link>} />
      <Load q={dash} rows={3}>
        {dash.data && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Total outstanding" value={rupees(dash.data.totalOutstanding)} />
            <Stat label="Overdue" value={rupees(dash.data.totalOverdue)} tone={dash.data.totalOverdue ? "danger" : undefined} />
            <Stat label="Open invoices" value={dash.data.openInvoiceCount} />
            <Stat label="Customers owing" value={dash.data.customersWithOutstanding} />
          </div>
        )}
      </Load>

      <Load q={ageing} rows={2}>
        {ageing.data && (
          <div className="flex flex-col gap-2">
            <h3 className="text-h4 font-semibold">Ageing</h3>
            <Table testId="ageing-table"><thead><tr>{BUCKETS.map(([, l]) => <Th key={l} right>{l}</Th>)}</tr></thead><tbody>
              <tr>{BUCKETS.map(([k]) => <Td key={k} right>{rupees(ageing.data!.overall[k])}</Td>)}</tr>
            </tbody></Table>
            {ageing.data.byCustomer.length > 0 && (
              <details className="rounded-lg border border-border-subtle bg-surface p-3">
                <summary className="cursor-pointer text-body-sm font-medium">By customer ({ageing.data.byCustomer.length})</summary>
                <Table testId="ageing-by-customer"><thead><tr><Th>Customer</Th>{BUCKETS.map(([, l]) => <Th key={l} right>{l}</Th>)}<Th right>Total</Th></tr></thead><tbody>
                  {ageing.data.byCustomer.map((c) => (
                    <tr key={c.customerId}>
                      <Td className="font-medium">{c.customerName}</Td>
                      {BUCKETS.map(([k]) => <Td key={k} right>{rupees(c.ageing[k])}</Td>)}
                      <Td right className="font-medium">{rupees(c.total)}</Td>
                    </tr>
                  ))}
                </tbody></Table>
              </details>
            )}
          </div>
        )}
      </Load>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-h4 font-semibold">Outstanding invoices</h3>
          <input className="h-9 w-56 rounded-md border border-border bg-surface px-3 text-body-sm" placeholder="Filter by customer…" value={customerFilter} onChange={(e) => setCustomerFilter(e.target.value)} data-testid="outstanding-filter" />
        </div>
        <Load q={out}>
          {rows.length === 0 ? <EmptyState icon={<CheckCircle2 className="h-8 w-8" />} title="Nothing outstanding" description="Every issued invoice has been paid in full." /> : (
            <Table testId="outstanding-table"><thead><tr><Th>Invoice</Th><Th>Customer</Th><Th>Issued</Th><Th>Due</Th><Th right>Total</Th><Th right>Paid</Th><Th right>Balance</Th><Th>Status</Th></tr></thead><tbody>
              {rows.map((r) => (
                <tr key={r.invoiceId} data-testid="outstanding-row">
                  <Td className="font-medium">{r.invoiceNo}</Td>
                  <Td>{r.customerName}</Td>
                  <Td>{day(r.issueDate)}</Td>
                  <Td>{day(r.dueDate)}{r.daysOverdue > 0 && <span className="ml-1 text-caption text-danger">({r.daysOverdue}d overdue)</span>}</Td>
                  <Td right>{rupees(r.total)}</Td>
                  <Td right>{rupees(r.paid)}</Td>
                  <Td right className="font-medium">{rupees(r.balance)}</Td>
                  <Td><Status s={r.status} /></Td>
                </tr>
              ))}
            </tbody></Table>
          )}
        </Load>
      </div>
    </div>
  );
}
