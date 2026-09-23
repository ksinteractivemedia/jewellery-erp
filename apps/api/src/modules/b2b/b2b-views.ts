import type { Types } from "mongoose";
import type { B2BAllocationView, B2BInvoice, B2BLine, B2BPayment, B2BPurchaseOrder, B2BQuotation, B2BSalesOrder, CreditCheck, B2BHistoryEntry } from "@jewellery/types";
import { AllocationModel, B2BPaymentModel, InvoiceModel, type HistoryAttrs, type InvoiceAttrs, type LineAttrs, type PurchaseOrderAttrs, type QuotationAttrs, type SalesOrderAttrs, type B2BPaymentAttrs } from "./b2b.models";
import { daysOverdue, invoiceStatus } from "./credit";

const id = (v: unknown) => String(v);
/** A document's id whether it came from `.lean()` (`_id`) or `.toObject()` (the schema transform renames it to `id`). */
const docId = (d: { _id?: unknown; id?: unknown }) => String(d._id ?? d.id);
const iso = (d?: Date | string) => (d ? new Date(d).toISOString() : undefined);
type WithId<T> = T & { _id?: Types.ObjectId | string; id?: string; createdAt?: Date };

export const lineView = (l: LineAttrs): B2BLine => ({
  productId: id(l.productId),
  ...(l.variantId ? { variantId: id(l.variantId) } : {}),
  sku: l.sku,
  name: l.name,
  ...(l.variantLabel ? { variantLabel: l.variantLabel } : {}),
  quantity: l.quantity,
  ...(l.priceOnRequest ? { priceOnRequest: true } : {}),
  unitMaking: l.unitMaking ?? 0,
  unitDiscount: l.unitDiscount ?? 0,
  unitTaxable: l.unitTaxable,
  unitGst: l.unitGst,
  unitTotal: l.unitTotal,
  lineMaking: l.lineMaking ?? 0,
  lineDiscount: l.lineDiscount ?? 0,
  lineTaxable: l.lineTaxable,
  lineGst: l.lineGst,
  lineTotal: l.lineTotal,
  ...(l.basis ? { basis: l.basis as B2BLine["basis"] } : {}),
  ...(l.concession ? { concession: { kind: l.concession.kind, value: l.concession.value, ...(l.concession.note ? { note: l.concession.note } : {}), ...(l.concession.listUnitTaxable !== undefined ? { listUnitTaxable: l.concession.listUnitTaxable } : {}) } } : {}),
  ...(l.priceSnapshotId ? { priceSnapshotId: id(l.priceSnapshotId) } : {}),
});
const historyView = (h: HistoryAttrs): B2BHistoryEntry => ({ status: h.status, at: iso(h.at)!, by: h.by, ...(h.actorName ? { actorName: h.actorName } : {}), ...(h.note ? { note: h.note } : {}) });
const addressView = (a: { line1: string; line2?: string; city: string; state: string; postalCode: string; country: string }) => ({ line1: a.line1, ...(a.line2 ? { line2: a.line2 } : {}), city: a.city, state: a.state, postalCode: a.postalCode, country: a.country });

export const poView = (d: WithId<PurchaseOrderAttrs>): B2BPurchaseOrder => ({
  id: docId(d),
  poNo: d.poNo,
  ...(d.customerPoRef ? { customerPoRef: d.customerPoRef } : {}),
  customer: { id: id(d.customerId), name: d.customerName },
  status: d.status,
  lines: d.lines.map(lineView),
  totals: { taxable: d.totals.taxable, gst: d.totals.gst, total: d.totals.total, complete: d.totals.complete },
  shippingAddress: addressView(d.shippingAddress),
  billingAddress: addressView(d.billingAddress ?? d.shippingAddress),
  ...(d.notes ? { notes: d.notes } : {}),
  ...(d.requestedDeliveryDate ? { requestedDeliveryDate: d.requestedDeliveryDate } : {}),
  attachments: (d.attachments ?? []).map((a) => ({ id: docId(a as never), name: a.name, mimeType: a.mimeType, size: a.size, uploadedAt: iso(a.uploadedAt)!, uploadedBy: a.uploadedBy, ...(a.uploadedByName ? { uploadedByName: a.uploadedByName } : {}) })),
  ...(d.approved?.lines?.length ? { approved: { lines: d.approved.lines.map(lineView), totals: { taxable: d.approved.totals.taxable, gst: d.approved.totals.gst, total: d.approved.totals.total, complete: d.approved.totals.complete }, approvedAt: iso(d.approved.approvedAt)!, ...(d.approved.approvedByName ? { approvedByName: d.approved.approvedByName } : {}), via: d.approved.via } } : {}),
  ...(d.credit ? { credit: d.credit as CreditCheck } : {}),
  ...(d.quotationId ? { quotationId: id(d.quotationId) } : {}),
  ...(d.salesOrderId ? { salesOrderId: id(d.salesOrderId) } : {}),
  ...(d.submittedAt ? { submittedAt: iso(d.submittedAt)! } : {}),
  history: d.history.map(historyView),
  createdAt: iso(d.createdAt)!,
});

export const quotationView = (d: WithId<QuotationAttrs>, ctx: { poNo: string; customerName: string; now: Date }): B2BQuotation => ({
  id: docId(d),
  quoteNo: d.quoteNo,
  version: d.version,
  purchaseOrderId: id(d.purchaseOrderId),
  poNo: ctx.poNo,
  customer: { id: id(d.customerId), name: ctx.customerName },
  // An issued quotation past its validity is EXPIRED — decided when it is read and enforced when it is accepted.
  status: (d.status === "QUOTED" || d.status === "NEGOTIATION") && d.validUntil <= ctx.now ? "EXPIRED" : d.status,
  lines: d.lines.map(lineView),
  totals: { taxable: d.totals.taxable, gst: d.totals.gst, total: d.totals.total, complete: d.totals.complete },
  validUntil: iso(d.validUntil)!,
  ...(d.terms ? { terms: d.terms } : {}),
  messages: d.messages.map((m) => ({ by: m.by, at: iso(m.at)!, text: m.text, ...(m.requestedPrices?.length ? { requestedPrices: m.requestedPrices.map((r) => ({ sku: r.sku, unitTaxable: r.unitTaxable })) } : {}) })),
  issuedAt: iso(d.issuedAt)!,
});

export const salesOrderView = (d: WithId<SalesOrderAttrs>, invoices: { id: string; invoiceNo: string; total: number }[] = []): B2BSalesOrder => {
  const credit = d.credit as { check: CreditCheck; override?: { reason: string; at: Date; byName?: string } };
  return {
    id: docId(d),
    soNo: d.soNo,
    purchaseOrderId: id(d.purchaseOrderId),
    poNo: d.poNo,
    ...(d.customerPoRef ? { customerPoRef: d.customerPoRef } : {}),
    ...(d.quotationId ? { quotationId: id(d.quotationId) } : {}),
    customer: { id: id(d.customerId), name: d.customerName },
    status: d.status,
    lines: d.lines.map(lineView),
    progress: d.lines.map((l, i) => ({ sku: l.sku, quantity: l.quantity, allocated: d.allocations.find((a) => a.lineIndex === i)?.itemIds.length ?? 0, invoiced: d.invoiced.find((x) => x.lineIndex === i)?.quantity ?? 0 })),
    totals: { taxable: d.totals.taxable, gst: d.totals.gst, total: d.totals.total, complete: d.totals.complete },
    shippingAddress: addressView(d.shippingAddress),
    billingAddress: addressView(d.billingAddress ?? d.shippingAddress),
    credit: { check: credit.check, ...(credit.override ? { override: { reason: credit.override.reason, at: iso(credit.override.at)!, ...(credit.override.byName ? { byName: credit.override.byName } : {}) } } : {}) },
    ...(d.shortfall ? { shortfall: d.shortfall as B2BSalesOrder["shortfall"] } : {}),
    ...(d.allocatedAt ? { allocatedAt: iso(d.allocatedAt)! } : {}),
    invoices,
    history: d.history.map(historyView),
    createdAt: iso(d.createdAt)!,
  };
};

/** Allocation rows as customers and staff read them: which payment paid which invoice, by how much, when. */
export async function allocationViews(filter: { invoiceId?: unknown; paymentId?: unknown; customerId?: unknown }): Promise<(B2BAllocationView & { _paymentId: string; _invoiceId: string })[]> {
  const rows = await AllocationModel.find({ ...filter, reversedAt: { $exists: false } }).sort({ createdAt: 1 }).lean();
  const [payments, invoices] = await Promise.all([
    B2BPaymentModel.find({ _id: { $in: rows.map((r) => r.paymentId) } }).select("paymentNo method reference").lean(),
    InvoiceModel.find({ _id: { $in: rows.map((r) => r.invoiceId) } }).select("invoiceNo").lean(),
  ]);
  const pay = new Map(payments.map((p) => [id(p._id), p]));
  const inv = new Map(invoices.map((i) => [id(i._id), i]));
  return rows.map((r) => ({
    paymentId: id(r.paymentId),
    paymentNo: pay.get(id(r.paymentId))?.paymentNo ?? "",
    invoiceId: id(r.invoiceId),
    invoiceNo: inv.get(id(r.invoiceId))?.invoiceNo ?? "",
    amount: r.amount,
    at: iso(r.createdAt)!,
    method: pay.get(id(r.paymentId))?.method ?? "OTHER",
    ...(pay.get(id(r.paymentId))?.reference ? { reference: pay.get(id(r.paymentId))!.reference! } : {}),
    _paymentId: id(r.paymentId),
    _invoiceId: id(r.invoiceId),
  }));
}
const stripAlloc = ({ _paymentId, _invoiceId, ...a }: B2BAllocationView & { _paymentId: string; _invoiceId: string }): B2BAllocationView => a;

export function invoiceView(d: WithId<InvoiceAttrs>, paid: number, allocations: B2BAllocationView[], today: string): B2BInvoice {
  return {
    id: docId(d),
    invoiceNo: d.invoiceNo,
    sequence: d.sequence,
    salesOrderId: id(d.salesOrderId),
    soNo: d.soNo,
    customer: { id: id(d.customerId), name: d.customerName, ...(d.gstin ? { gstin: d.gstin } : {}) },
    issueDate: d.issueDate,
    dueDate: d.dueDate,
    lines: d.lines.map(lineView),
    totals: { taxable: d.totals.taxable, gst: d.totals.gst, total: d.totals.total, complete: true },
    taxes: { supplyType: d.taxes.supplyType, cgst: d.taxes.cgst, sgst: d.taxes.sgst, igst: d.taxes.igst },
    shippingAddress: addressView(d.shippingAddress),
    billingAddress: addressView(d.billingAddress ?? d.shippingAddress),
    paid,
    balance: Math.max(d.totals.total - paid, 0),
    status: invoiceStatus({ total: d.totals.total, paid, dueDate: d.dueDate, today, cancelled: d.status === "CANCELLED" }),
    daysOverdue: d.totals.total - paid > 0 ? daysOverdue(d.dueDate, today) : 0,
    allocations,
  };
}

export function paymentView(d: WithId<B2BPaymentAttrs>, customerName: string, allocations: B2BAllocationView[]): B2BPayment {
  const allocated = allocations.reduce((s, a) => s + a.amount, 0);
  return {
    id: docId(d),
    paymentNo: d.paymentNo,
    customer: { id: id(d.customerId), name: customerName },
    method: d.method,
    amount: d.amount,
    receivedDate: d.receivedDate,
    ...(d.reference ? { reference: d.reference } : {}),
    ...(d.bankName ? { bankName: d.bankName } : {}),
    ...(d.notes ? { notes: d.notes } : {}),
    source: d.source,
    status: d.status,
    ...(d.recordedByName ? { recordedByName: d.recordedByName } : {}),
    ...(d.verifiedByName ? { verifiedByName: d.verifiedByName } : {}),
    ...(d.verifiedAt ? { verifiedAt: iso(d.verifiedAt)! } : {}),
    ...(d.rejectedReason ?? d.reversedReason ? { rejectedReason: (d.rejectedReason ?? d.reversedReason)! } : {}),
    allocated,
    // Only money someone has confirmed can be applied.
    unallocated: d.status === "VERIFIED" ? d.amount - allocated : 0,
    allocations,
    createdAt: iso(d.createdAt)!,
  };
}
export { stripAlloc };
