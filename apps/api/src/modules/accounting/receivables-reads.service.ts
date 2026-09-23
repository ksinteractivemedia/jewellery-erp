import type { AgeingReport, CustomerAgeing, OutstandingInvoiceRow, ReceivablesSummary } from "@jewellery/types";
import { businessDay } from "../dashboard/range";
import { paidByInvoice } from "../b2b/b2b-core";
import { ageInvoices, daysOverdue, invoiceStatus, isOverdue } from "../b2b/credit";
import { InvoiceModel } from "../b2b/b2b.models";

/**
 * Everything the ERP's Receivables Dashboard, Outstanding list and Ageing report need — computed
 * here, server-side, from the same primitives B2B's own credit/outstanding screens already use
 * (`ageInvoices`, `isOverdue`, `invoiceStatus`, `paidByInvoice`), never re-implemented and never
 * hardcoded into a React component (CLAUDE.md rule 4 / the task's own instruction). The difference
 * from B2B's per-customer `reads.outstanding` is scope: this is *every* B2B customer at once, the
 * view a business's own accounts team needs, not a single customer's own portal page.
 */
async function openInvoiceRows() {
  const docs = await InvoiceModel.find({ status: "ISSUED" }).select("invoiceNo customerId customerName issueDate dueDate totals").lean();
  const paid = await paidByInvoice(docs.map((d) => d._id));
  return docs
    .map((d) => ({ ...d, paid: paid.get(String(d._id)) ?? 0, balance: d.totals.total - (paid.get(String(d._id)) ?? 0) }))
    .filter((d) => d.balance > 0);
}

export async function receivablesSummary(): Promise<ReceivablesSummary> {
  const today = businessDay(new Date());
  const open = await openInvoiceRows();
  const overdue = open.filter((d) => isOverdue(d.dueDate, today));
  return {
    totalOutstanding: open.reduce((s, d) => s + d.balance, 0),
    totalOverdue: overdue.reduce((s, d) => s + d.balance, 0),
    overdueInvoiceCount: overdue.length,
    openInvoiceCount: open.length,
    customersWithOutstanding: new Set(open.map((d) => String(d.customerId))).size,
    ageing: ageInvoices(open.map((d) => ({ balance: d.balance, dueDate: d.dueDate })), today),
  };
}

export async function outstandingInvoices(filter: { customerId?: string } = {}): Promise<OutstandingInvoiceRow[]> {
  const today = businessDay(new Date());
  let open = await openInvoiceRows();
  if (filter.customerId) open = open.filter((d) => String(d.customerId) === filter.customerId);
  return open
    .map((d) => ({
      invoiceId: String(d._id),
      invoiceNo: d.invoiceNo,
      customerId: String(d.customerId),
      customerName: d.customerName,
      issueDate: d.issueDate,
      dueDate: d.dueDate,
      total: d.totals.total,
      paid: d.paid,
      balance: d.balance,
      status: invoiceStatus({ total: d.totals.total, paid: d.paid, dueDate: d.dueDate, today }),
      daysOverdue: daysOverdue(d.dueDate, today),
    }))
    .sort((a, b) => b.daysOverdue - a.daysOverdue || b.balance - a.balance);
}

export async function ageingReport(): Promise<AgeingReport> {
  const today = businessDay(new Date());
  const open = await openInvoiceRows();
  const overall = ageInvoices(open.map((d) => ({ balance: d.balance, dueDate: d.dueDate })), today);

  const byCustomerMap = new Map<string, { name: string; rows: { balance: number; dueDate: string }[] }>();
  for (const d of open) {
    const key = String(d.customerId);
    if (!byCustomerMap.has(key)) byCustomerMap.set(key, { name: d.customerName, rows: [] });
    byCustomerMap.get(key)!.rows.push({ balance: d.balance, dueDate: d.dueDate });
  }
  const byCustomer: CustomerAgeing[] = [...byCustomerMap]
    .map(([customerId, v]) => ({ customerId, customerName: v.name, ageing: ageInvoices(v.rows, today), total: v.rows.reduce((s, r) => s + r.balance, 0) }))
    .sort((a, b) => b.total - a.total);

  return { asOf: today, overall, byCustomer };
}
