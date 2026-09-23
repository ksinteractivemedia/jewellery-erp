import { Types } from "mongoose";
import { isLedgerTracked } from "@jewellery/types";
import type { SupplierInvoice } from "@jewellery/types";
import type { CreateSupplierInvoiceInput } from "@jewellery/validation";
import { NotFoundError } from "../../shared/errors";
import { AUDIT_ACTIONS } from "../audit/audit.service";
import { postPurchaseInvoice } from "../accounting/purchase-posting";
import { reverseJournal } from "../accounting/posting.service";
import { AccountingEntryModel } from "../accounting/accounting-entry.model";
import { withInventoryTransaction } from "../inventory/inventory-transaction.service";
import { requireSupplierById } from "../suppliers/supplier.repository";
import { buildPurchaseLine, totalsOf } from "./procurement-core";
import { supplierInvoiceView } from "./procurement-views";
import { checkSupplierInvoiceAction } from "./procurement-status";
import { audit, oid, type Actor } from "./procurement-store";
import { SupplierPaymentAllocationModel } from "./procurement.models";
import { PurchaseOrderModel, SupplierInvoiceModel, type SupplierInvoiceDocument } from "./procurement.models";
import { requirePurchaseOrder } from "./purchase-order.service";

/** Sum of unreversed allocations against a set of invoices — the ONLY source of what has been paid; never stored on the invoice itself. */
export async function paidBySupplierInvoice(invoiceIds: (Types.ObjectId | string)[]): Promise<Map<string, number>> {
  if (!invoiceIds.length) return new Map();
  const rows = await SupplierPaymentAllocationModel.aggregate<{ _id: unknown; paid: number }>([
    { $match: { supplierInvoiceId: { $in: invoiceIds.map((x) => (typeof x === "string" ? new Types.ObjectId(x) : x)) }, reversedAt: { $exists: false } } },
    { $group: { _id: "$supplierInvoiceId", paid: { $sum: "$amount" } } },
  ]);
  return new Map(rows.map((r) => [String(r._id), r.paid]));
}

/** Records a supplier's own bill. Optionally linked to a purchase order and/or the goods receipts it covers — the amounts are entered directly, not recomputed from them (the paper invoice is the source of truth for what we owe). */
export async function createSupplierInvoice(actor: Actor, input: CreateSupplierInvoiceInput): Promise<SupplierInvoice> {
  const supplier = await requireSupplierById(input.supplierId);
  let poNo: string | undefined;
  if (input.purchaseOrderId) poNo = (await requirePurchaseOrder(input.purchaseOrderId)).poNo;
  const built = await Promise.all(input.lines.map((l) => buildPurchaseLine(l)));
  const lines = built.map(({ receivedQuantity: _rq, receivedGrossWeight: _rg, ...rest }) => rest);
  const now = new Date();
  const totals = totalsOf(lines, input.taxAmount);

  const doc = await withInventoryTransaction(async (session) => {
    const [inv] = await SupplierInvoiceModel.create(
      [
        {
          supplierInvoiceNo: input.supplierInvoiceNo,
          supplierId: oid(input.supplierId),
          supplierName: supplier.name,
          ...(supplier.gstin ? { supplierGstin: supplier.gstin } : {}),
          ...(input.purchaseOrderId ? { purchaseOrderId: oid(input.purchaseOrderId) } : {}),
          ...(poNo ? { poNo } : {}),
          goodsReceiptIds: input.goodsReceiptIds.map(oid),
          invoiceDate: input.invoiceDate,
          dueDate: input.dueDate ?? input.invoiceDate,
          lines,
          totals,
          history: [{ status: "UNPAID", at: now, by: oid(actor.id), byName: actor.name }],
        },
      ],
      { session }
    );
    if (input.purchaseOrderId) await PurchaseOrderModel.updateOne({ _id: oid(input.purchaseOrderId) }, { $push: { supplierInvoiceIds: inv!._id } }, { session });
    // The liability arises here, at the bill — not at the earlier goods receipt, which may have no invoice yet.
    await postPurchaseInvoice(session, {
      date: input.invoiceDate,
      supplierInvoiceId: inv!.id,
      supplierInvoiceNo: input.supplierInvoiceNo,
      performedBy: actor.id,
      performedByName: actor.name,
      inventoryValue: lines.filter((l) => isLedgerTracked(l.purchaseType)).reduce((s, l) => s + l.value, 0),
      purchasesValue: lines.filter((l) => !isLedgerTracked(l.purchaseType)).reduce((s, l) => s + l.value, 0),
      gstReceivable: totals.taxAmount,
      total: totals.total,
    });
    return inv!;
  });
  await audit(actor, AUDIT_ACTIONS.PROCUREMENT_SUPPLIER_INVOICE_RECORDED, "SupplierInvoice", doc.id, { supplierInvoiceNo: doc.supplierInvoiceNo, supplier: supplier.name, total: doc.totals.total });
  return supplierInvoiceView(doc.toObject());
}

export async function cancelSupplierInvoice(invoiceId: string, actor: Actor, reason: string): Promise<SupplierInvoice> {
  const inv = await requireSupplierInvoice(invoiceId);
  const paid = (await paidBySupplierInvoice([inv._id])).get(inv.id) ?? 0;
  // The invoice's status is derived, not stored (same rule as its own PAID/UNPAID) — the current guard just needs the same derivation.
  const status = inv.cancelledAt ? "CANCELLED" : paid <= 0 ? "UNPAID" : paid < inv.totals.total ? "PARTIALLY_PAID" : "PAID";
  checkSupplierInvoiceAction("cancel", status);
  await withInventoryTransaction(async (session) => {
    inv.cancelledAt = new Date();
    inv.cancelledReason = reason;
    inv.history.push({ status: "CANCELLED", at: new Date(), by: oid(actor.id), byName: actor.name, note: reason });
    await inv.save({ session });
    // Cancel is UNPAID-only, so nothing has been allocated against this invoice yet — just undo what it posted.
    const original = await AccountingEntryModel.findOne({ referenceType: "PURCHASE_INVOICE", referenceId: inv._id }).session(session);
    if (original) await reverseJournal(session, original.id, { performedBy: actor.id, performedByName: actor.name, reason: `Supplier invoice cancelled: ${reason}` });
  });
  await audit(actor, AUDIT_ACTIONS.PROCUREMENT_SUPPLIER_INVOICE_CANCELLED, "SupplierInvoice", inv.id, { supplierInvoiceNo: inv.supplierInvoiceNo, reason });
  return supplierInvoiceView(inv.toObject());
}

export async function requireSupplierInvoice(invoiceId: string): Promise<SupplierInvoiceDocument> {
  const doc = await SupplierInvoiceModel.findById(invoiceId);
  if (!doc) throw new NotFoundError("Supplier invoice", invoiceId);
  return doc;
}

export async function getSupplierInvoice(invoiceId: string): Promise<SupplierInvoice> {
  const doc = await requireSupplierInvoice(invoiceId);
  const paid = (await paidBySupplierInvoice([doc._id])).get(doc.id) ?? 0;
  return supplierInvoiceView(doc.toObject(), paid);
}

export async function listSupplierInvoices(filter: { supplierId?: string; purchaseOrderId?: string } = {}): Promise<SupplierInvoice[]> {
  const query: Record<string, unknown> = {};
  if (filter.supplierId) query.supplierId = oid(filter.supplierId);
  if (filter.purchaseOrderId) query.purchaseOrderId = oid(filter.purchaseOrderId);
  const docs = await SupplierInvoiceModel.find(query).sort({ createdAt: -1 }).limit(200);
  const paid = await paidBySupplierInvoice(docs.map((d) => d._id));
  return docs.map((d) => supplierInvoiceView(d.toObject(), paid.get(d.id) ?? 0));
}
