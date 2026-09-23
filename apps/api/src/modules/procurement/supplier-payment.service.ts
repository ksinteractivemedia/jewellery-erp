import { Types } from "mongoose";
import type { SupplierPayment } from "@jewellery/types";
import type { RecordSupplierPaymentInput } from "@jewellery/validation";
import { ConflictError, DomainValidationError, NotFoundError } from "../../shared/errors";
import { AUDIT_ACTIONS } from "../audit/audit.service";
import { postPaymentMade } from "../accounting/purchase-posting";
import { reverseJournal } from "../accounting/posting.service";
import { AccountingEntryModel } from "../accounting/accounting-entry.model";
import { businessDay } from "../dashboard/range";
import { withInventoryTransaction } from "../inventory/inventory-transaction.service";
import { requireSupplierById } from "../suppliers/supplier.repository";
import { paidBySupplierInvoice } from "./supplier-invoice.service";
import { checkSupplierPaymentAction } from "./procurement-status";
import { audit, nextNo, oid, type Actor } from "./procurement-store";
import { SupplierInvoiceModel, SupplierPaymentAllocationModel, SupplierPaymentModel, type SupplierPaymentDocument } from "./procurement.models";
import { supplierPaymentView } from "./procurement-views";

/**
 * Money we pay OUT to a supplier. Unlike a B2B customer's payment (which needs a second person to
 * verify a claim before it can be trusted), a supplier payment is entered by staff who already hold
 * `accounting.create_payment` and is itself the audited record — recording it makes it immediately
 * available to allocate against invoices. It can still be reversed (a stopped cheque, a wrong entry).
 */
async function loadPayment(paymentId: string): Promise<SupplierPaymentDocument> {
  if (!Types.ObjectId.isValid(paymentId)) throw new NotFoundError("Supplier payment", paymentId);
  const p = await SupplierPaymentModel.findById(paymentId);
  if (!p) throw new NotFoundError("Supplier payment", paymentId);
  return p;
}
async function allocationsFor(paymentId: Types.ObjectId) {
  const rows = await SupplierPaymentAllocationModel.find({ paymentId }).sort({ createdAt: 1 }).lean();
  return rows.map((a) => ({ paymentId: String(a.paymentId), paymentNo: a.paymentNo, supplierInvoiceId: String(a.supplierInvoiceId), supplierInvoiceNo: a.supplierInvoiceNo, amount: a.amount, at: a.createdAt.toISOString() }));
}
async function view(p: SupplierPaymentDocument): Promise<SupplierPayment> {
  return supplierPaymentView(p.toObject(), await allocationsFor(p._id));
}

export async function recordSupplierPayment(actor: Actor, input: RecordSupplierPaymentInput): Promise<SupplierPayment> {
  const supplier = await requireSupplierById(input.supplierId);
  if (input.paidDate > businessDay(new Date())) throw new DomainValidationError("A payment can't be dated in the future.");
  const doc = await SupplierPaymentModel.create({
    paymentNo: await nextNo("SPY"),
    supplierId: oid(input.supplierId),
    supplierName: supplier.name,
    method: input.method,
    amount: input.amount,
    paidDate: input.paidDate,
    ...(input.reference ? { reference: input.reference } : {}),
    ...(input.bankName ? { bankName: input.bankName } : {}),
    ...(input.notes ? { notes: input.notes } : {}),
    recordedById: oid(actor.id),
    recordedByName: actor.name,
  });
  await audit(actor, AUDIT_ACTIONS.PROCUREMENT_SUPPLIER_PAYMENT_RECORDED, "SupplierPayment", doc.id, { paymentNo: doc.paymentNo, supplier: supplier.name, amount: input.amount, method: input.method });
  return view(doc);
}

/** Apply a recorded payment to one or more supplier invoices. Both the payment and each invoice are touched in the same transaction, so two allocations racing for one payment (or one invoice) conflict and the loser re-reads the truth: nothing is ever over-applied. */
export async function allocateSupplierPayment(paymentId: string, actor: Actor, allocations: { supplierInvoiceId: string; amount: number }[]): Promise<SupplierPayment> {
  const p = await loadPayment(paymentId);
  const merged = new Map<string, number>();
  for (const a of allocations) merged.set(a.supplierInvoiceId, (merged.get(a.supplierInvoiceId) ?? 0) + a.amount);

  await withInventoryTransaction(async (session) => {
    const pay = await SupplierPaymentModel.findOneAndUpdate({ _id: p._id, status: "RECORDED" }, { $inc: { allocationSeq: 1 } }, { new: true, session });
    if (!pay) throw new ConflictError("Only a recorded, unreversed payment can be applied to invoices.");
    const already = (await SupplierPaymentAllocationModel.find({ paymentId: p._id, reversedAt: { $exists: false } }).session(session).lean()).reduce((s, a) => s + a.amount, 0);
    const requested = [...merged.values()].reduce((s, n) => s + n, 0);
    if (already + requested > pay.amount) throw new ConflictError(`Only ₹${((pay.amount - already) / 100).toLocaleString("en-IN")} of this payment is still unapplied.`);
    for (const [supplierInvoiceId, amount] of merged) {
      const inv = await SupplierInvoiceModel.findOneAndUpdate({ _id: supplierInvoiceId, supplierId: pay.supplierId, cancelledAt: { $exists: false } }, { $inc: { allocationSeq: 1 } }, { new: true, session });
      if (!inv) throw new NotFoundError("Supplier invoice", supplierInvoiceId); // also catches another supplier's invoice, or a cancelled one
      const balance = inv.totals.total - ((await paidBySupplierInvoice([inv._id])).get(inv.id) ?? 0);
      if (amount > balance) throw new ConflictError(`${inv.supplierInvoiceNo} only has ₹${(balance / 100).toLocaleString("en-IN")} left to pay.`);
      await SupplierPaymentAllocationModel.create([{ paymentId: pay._id, paymentNo: pay.paymentNo, supplierInvoiceId: inv._id, supplierInvoiceNo: inv.supplierInvoiceNo, supplierId: pay.supplierId, amount, createdById: oid(actor.id), createdByName: actor.name }], { session });
    }
    await postPaymentMade(session, { date: businessDay(new Date()), supplierPaymentId: pay.id, supplierPaymentNo: pay.paymentNo, performedBy: actor.id, performedByName: actor.name, amount: requested, method: pay.method });
  });
  await audit(actor, AUDIT_ACTIONS.PROCUREMENT_SUPPLIER_PAYMENT_ALLOCATED, "SupplierPayment", p.id, { paymentNo: p.paymentNo, allocations: [...merged].map(([supplierInvoiceId, amount]) => ({ supplierInvoiceId, amount })) });
  return view((await SupplierPaymentModel.findById(p._id))!);
}

export async function reverseSupplierPayment(paymentId: string, actor: Actor, reason: string): Promise<SupplierPayment> {
  const p = await loadPayment(paymentId);
  checkSupplierPaymentAction("reverse", p.status);
  await withInventoryTransaction(async (session) => {
    const moved = await SupplierPaymentModel.findOneAndUpdate({ _id: p._id, status: "RECORDED" }, { $set: { status: "REVERSED", reversedReason: reason, reversedAt: new Date() }, $inc: { allocationSeq: 1 } }, { new: true, session });
    if (!moved) throw new ConflictError("Only a recorded payment can be reversed.");
    await SupplierPaymentAllocationModel.updateMany({ paymentId: p._id, reversedAt: { $exists: false } }, { $set: { reversedAt: new Date(), reversedReason: reason } }, { session });
    const posted = await AccountingEntryModel.find({ referenceType: "PAYMENT_MADE", referenceId: p._id }).session(session);
    for (const j of posted) await reverseJournal(session, j.id, { performedBy: actor.id, performedByName: actor.name, reason: `Payment reversed: ${reason}` });
  });
  await audit(actor, AUDIT_ACTIONS.PROCUREMENT_SUPPLIER_PAYMENT_REVERSED, "SupplierPayment", p.id, { paymentNo: p.paymentNo, amount: p.amount, reason });
  return view((await SupplierPaymentModel.findById(p._id))!);
}

export async function getSupplierPayment(paymentId: string): Promise<SupplierPayment> {
  return view(await loadPayment(paymentId));
}

export async function listSupplierPayments(filter: { supplierId?: string } = {}): Promise<SupplierPayment[]> {
  const query: Record<string, unknown> = {};
  if (filter.supplierId) query.supplierId = oid(filter.supplierId);
  const docs = await SupplierPaymentModel.find(query).sort({ createdAt: -1 }).limit(200);
  return Promise.all(docs.map((d) => view(d)));
}
