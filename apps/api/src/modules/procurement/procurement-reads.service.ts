import type { PurchaseDashboard, Supplier, SupplierOutstanding } from "@jewellery/types";
import { businessDay, daysBetween } from "../dashboard/range";
import { listSuppliers, requireSupplierById } from "../suppliers/supplier.repository";
import { goodsReceiptView, purchaseOrderView } from "./procurement-views";
import { oid } from "./procurement-store";
import { GoodsReceiptModel, PurchaseOrderModel, PurchaseRequisitionModel, SupplierInvoiceModel } from "./procurement.models";
import { paidBySupplierInvoice } from "./supplier-invoice.service";

const PENDING_RECEIPT_STATUSES = ["APPROVED", "PARTIALLY_RECEIVED"];

async function unpaidInvoicesFor(supplierId?: string) {
  const query: Record<string, unknown> = { cancelledAt: { $exists: false } };
  if (supplierId) query.supplierId = oid(supplierId);
  const invoices = await SupplierInvoiceModel.find(query).lean();
  const paid = await paidBySupplierInvoice(invoices.map((i) => i._id));
  return invoices.map((i) => ({ id: String(i._id), supplierInvoiceNo: i.supplierInvoiceNo, supplierId: String(i.supplierId), dueDate: i.dueDate, total: i.totals.total, paid: paid.get(String(i._id)) ?? 0 })).filter((i) => i.total - i.paid > 0);
}

function ageing(rows: { balance: number; dueDate: string }[], today: string) {
  const b = { current: 0, days1to30: 0, days31to60: 0, days61to90: 0, over90: 0 };
  for (const r of rows) {
    if (r.balance <= 0) continue;
    const late = daysBetween(r.dueDate, today);
    if (late <= 0) b.current += r.balance;
    else if (late <= 30) b.days1to30 += r.balance;
    else if (late <= 60) b.days31to60 += r.balance;
    else if (late <= 90) b.days61to90 += r.balance;
    else b.over90 += r.balance;
  }
  return b;
}

/** Every supplier, with what we currently owe them (accounts payable) — computed from unpaid invoices, never stored. */
export async function listSuppliersWithPosition(): Promise<(Supplier & { totalOwed: number; overdue: number })[]> {
  const suppliers = await listSuppliers();
  const unpaid = await unpaidInvoicesFor();
  const today = businessDay(new Date());
  const bySupplier = new Map<string, { balance: number; dueDate: string }[]>();
  for (const i of unpaid) bySupplier.set(i.supplierId, [...(bySupplier.get(i.supplierId) ?? []), { balance: i.total - i.paid, dueDate: i.dueDate }]);
  return suppliers.map((s) => {
    const rows = bySupplier.get(s.id) ?? [];
    const a = ageing(rows, today);
    return { ...s, totalOwed: rows.reduce((sum, r) => sum + r.balance, 0), overdue: a.days1to30 + a.days31to60 + a.days61to90 + a.over90 };
  });
}

/** One supplier's payables in full: every unpaid invoice, ageing buckets, the total and overdue amount owed. */
export async function getSupplierOutstanding(supplierId: string): Promise<SupplierOutstanding> {
  const supplier = await requireSupplierById(supplierId);
  const unpaid = await unpaidInvoicesFor(supplierId);
  const today = businessDay(new Date());
  const rows = unpaid.map((i) => ({ ...i, balance: i.total - i.paid }));
  const a = ageing(rows, today);
  return {
    supplier: { id: supplier.id, name: supplier.name },
    totalOwed: rows.reduce((s, r) => s + r.balance, 0),
    overdue: a.days1to30 + a.days31to60 + a.days61to90 + a.over90,
    ageing: a,
    invoices: rows
      .sort((x, y) => x.dueDate.localeCompare(y.dueDate))
      .map((r) => ({ id: r.id, supplierInvoiceNo: r.supplierInvoiceNo, dueDate: r.dueDate, total: r.total, balance: r.balance, daysOverdue: Math.max(0, daysBetween(r.dueDate, today)), status: r.paid > 0 ? "PARTIALLY_PAID" : "UNPAID" })),
  };
}

/** What needs attention: open requisitions/POs, receipts pending, and the payables position — the ERP purchase dashboard's one read. */
export async function purchaseDashboard(): Promise<PurchaseDashboard> {
  const [openRequisitions, openPurchaseOrders, pendingReceipt, unpaid, recentPOs, recentGRs] = await Promise.all([
    PurchaseRequisitionModel.countDocuments({ status: "SUBMITTED" }),
    PurchaseOrderModel.countDocuments({ status: { $in: ["SUBMITTED", "APPROVED"] } }),
    PurchaseOrderModel.countDocuments({ status: { $in: PENDING_RECEIPT_STATUSES } }),
    unpaidInvoicesFor(),
    PurchaseOrderModel.find().sort({ createdAt: -1 }).limit(8).lean(),
    GoodsReceiptModel.find().sort({ createdAt: -1 }).limit(8).lean(),
  ]);
  const today = businessDay(new Date());
  const overdueCount = unpaid.filter((i) => daysBetween(i.dueDate, today) > 0).length;
  const totalOwed = unpaid.reduce((s, i) => s + (i.total - i.paid), 0);
  const overdue = unpaid.filter((i) => daysBetween(i.dueDate, today) > 0).reduce((s, i) => s + (i.total - i.paid), 0);
  return {
    counts: { openRequisitions, openPurchaseOrders, pendingReceipt, unpaidInvoices: unpaid.length, overdueInvoices: overdueCount },
    payables: { totalOwed, overdue },
    recentPurchaseOrders: recentPOs.map((d) => purchaseOrderView(d as never)),
    recentGoodsReceipts: recentGRs.map((d) => goodsReceiptView(d as never)),
  };
}
