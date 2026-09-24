import type { ReportResult } from "@jewellery/types";
import { businessDay } from "../dashboard/range";
import { CustomerModel } from "../customers/customer.model";
import { InvoiceModel, PurchaseOrderModel } from "../b2b/b2b.models";
import { creditPositionsFor } from "../b2b/b2b-core";
import { ageingReport, outstandingInvoices } from "../accounting/receivables-reads.service";
import type { ReportContext } from "./report-filters";
import { paginateArray } from "./report-filters";

const money0 = (n: number) => Math.round(n);

export async function b2bCustomerSales(ctx: ReportContext): Promise<ReportResult> {
  const invoices = await InvoiceModel.find({ status: "ISSUED", issueDate: { $gte: ctx.range.from, $lte: ctx.range.to } }).select("customerId customerName totals").lean();
  const byCustomer = new Map<string, { customerName: string; invoices: number; taxableValue: number; total: number }>();
  for (const inv of invoices) {
    const key = String(inv.customerId);
    const cur = byCustomer.get(key) ?? { customerName: inv.customerName, invoices: 0, taxableValue: 0, total: 0 };
    cur.invoices++;
    cur.taxableValue += inv.totals.taxable;
    cur.total += inv.totals.total;
    byCustomer.set(key, cur);
  }
  const rows = [...byCustomer.values()].map((r) => ({ ...r, taxableValue: money0(r.taxableValue), total: money0(r.total) })).sort((a, b) => b.total - a.total);
  const page = paginateArray(rows, ctx.page, ctx.pageSize);
  const grand = rows.reduce((s, r) => s + r.total, 0);
  return { key: "b2b-customer-sales", title: "", columns: [], rows: page.rows, summary: [{ label: "Total", value: grand, format: "money" }], page: ctx.page, pageSize: ctx.pageSize, total: page.total, scope: { from: ctx.range.from, to: ctx.range.to } };
}

/** A thin, paginated wrapper over the accounting module's own outstanding-invoices read — never re-derived. */
export async function b2bOutstanding(ctx: ReportContext): Promise<ReportResult> {
  const all = await outstandingInvoices();
  const rows = all.map((r) => ({ invoiceNo: r.invoiceNo, customerName: r.customerName, dueDate: r.dueDate, total: r.total, balance: r.balance, status: r.status }));
  const page = paginateArray(rows, ctx.page, ctx.pageSize);
  const grand = all.reduce((s, r) => s + r.balance, 0);
  return { key: "b2b-outstanding", title: "", columns: [], rows: page.rows, summary: [{ label: "Total outstanding", value: money0(grand), format: "money" }], page: ctx.page, pageSize: ctx.pageSize, total: page.total, scope: {} };
}

/** A thin, paginated wrapper over the accounting module's own ageing report — same `ageInvoices` math the B2B portal's outstanding page and the Receivables Dashboard both already use. */
export async function b2bAgeing(ctx: ReportContext): Promise<ReportResult> {
  const report = await ageingReport();
  const rows = report.byCustomer.map((c) => ({ customerName: c.customerName, current: c.ageing.current, days1to30: c.ageing.days1to30, days31to60: c.ageing.days31to60, days61to90: c.ageing.days61to90, over90: c.ageing.over90, total: c.total }));
  const page = paginateArray(rows, ctx.page, ctx.pageSize);
  return { key: "b2b-ageing", title: "", columns: [], rows: page.rows, summary: [{ label: "Total outstanding", value: money0(report.overall.current + report.overall.days1to30 + report.overall.days31to60 + report.overall.days61to90 + report.overall.over90), format: "money" }], page: ctx.page, pageSize: ctx.pageSize, total: page.total, scope: {} };
}

export async function b2bCreditUtilization(ctx: ReportContext): Promise<ReportResult> {
  const customers = await CustomerModel.find({ type: "B2B" }).select("name b2b").lean();
  const today = businessDay(new Date());
  const withProfile = customers.filter((c) => c.b2b);
  // One batched read (3 queries total) instead of creditFor()'s 3 queries per customer — this report is every
  // B2B customer at once, exactly the case creditPositionsFor exists for.
  const positionOf = await creditPositionsFor(withProfile.map((c) => ({ id: c._id, profile: c.b2b! })), today);
  const positions = withProfile.map((c) => ({ name: c.name, position: positionOf.get(String(c._id))! }));
  const rows = positions
    .map((p) => ({
      customerName: p.name,
      limit: money0(p.position.limit),
      outstanding: money0(p.position.outstanding),
      committed: money0(p.position.committed),
      available: money0(p.position.available),
      utilizationPercent: p.position.limit > 0 ? Math.round(((p.position.outstanding + p.position.committed) * 1000) / p.position.limit) / 10 : 0,
    }))
    .sort((a, b) => b.utilizationPercent - a.utilizationPercent);
  const page = paginateArray(rows, ctx.page, ctx.pageSize);
  return { key: "b2b-credit-utilization", title: "", columns: [], rows: page.rows, summary: [], page: ctx.page, pageSize: ctx.pageSize, total: page.total, scope: {} };
}

export async function b2bPoPipeline(ctx: ReportContext): Promise<ReportResult> {
  const docs = await PurchaseOrderModel.find({ createdAt: { $gte: ctx.range.start, $lt: ctx.range.end } }).select("status totals.total").lean();
  const byStatus = new Map<string, { count: number; total: number }>();
  for (const d of docs) {
    const cur = byStatus.get(d.status) ?? { count: 0, total: 0 };
    cur.count++;
    cur.total += d.totals.total;
    byStatus.set(d.status, cur);
  }
  const rows = [...byStatus.entries()].map(([status, t]) => ({ statusLabel: status.replace(/_/g, " "), count: t.count, total: money0(t.total) })).sort((a, b) => b.total - a.total);
  const page = paginateArray(rows, ctx.page, ctx.pageSize);
  const grand = rows.reduce((s, r) => s + r.total, 0);
  return { key: "b2b-po-pipeline", title: "", columns: [], rows: page.rows, summary: [{ label: "Total value", value: grand, format: "money" }], page: ctx.page, pageSize: ctx.pageSize, total: page.total, scope: { from: ctx.range.from, to: ctx.range.to } };
}
