import { Types } from "mongoose";
import type { DebitNote } from "@jewellery/types";
import type { CreateDebitNoteInput } from "@jewellery/validation";
import { ConflictError, NotFoundError } from "../../shared/errors";
import { formatDocumentNumber, nextSequence } from "../../shared/counters";
import { businessDay } from "../dashboard/range";
import { withInventoryTransaction } from "../inventory/inventory-transaction.service";
import { requireSupplierById } from "../suppliers/supplier.repository";
import { requireSupplierInvoice } from "../procurement/supplier-invoice.service";
import { AUDIT_ACTIONS } from "../audit/audit.service";
import { AccountingEntryModel } from "./accounting-entry.model";
import { debitNoteView } from "./accounting-views";
import { audit, type Actor } from "./accounting-store";
import { postJournal, reverseJournal } from "./posting.service";
import { DebitNoteModel, type DebitNoteDocument } from "./debit-note.model";

const oid = (v: string) => new Types.ObjectId(v);

/**
 * The purchase-side mirror of a credit note: reduces what the business owes a supplier — a
 * purchase return, a price correction, or a short-supply claim. Always debits Accounts Payable
 * and credits Inventory (this codebase's goods receipts capitalise straight to stock, never
 * through a separate "purchases in transit" account, so the correction lands where the value
 * actually sits) plus GST Receivable, reversing the input credit claimed on the original invoice.
 */
export async function createDebitNote(actor: Actor, input: CreateDebitNoteInput): Promise<DebitNote> {
  const supplier = await requireSupplierById(input.supplierId);
  let supplierInvoiceNo: string | undefined;
  if (input.supplierInvoiceId) {
    const inv = await requireSupplierInvoice(input.supplierInvoiceId);
    if (String(inv.supplierId) !== input.supplierId) throw new NotFoundError("Supplier invoice", input.supplierInvoiceId);
    supplierInvoiceNo = inv.supplierInvoiceNo;
  }
  const issueDate = input.issueDate ?? businessDay(new Date());
  const total = input.taxableValue + input.gst;
  const debitNoteNo = formatDocumentNumber("DN", await nextSequence("accounting-DN"));

  const doc = await withInventoryTransaction(async (session) => {
    const [note] = await DebitNoteModel.create(
      [
        {
          debitNoteNo,
          supplierId: oid(input.supplierId),
          supplierName: supplier.name,
          ...(input.supplierInvoiceId ? { supplierInvoiceId: oid(input.supplierInvoiceId), supplierInvoiceNo } : {}),
          reason: input.reason,
          ...(input.reasonNote ? { reasonNote: input.reasonNote } : {}),
          taxableValue: input.taxableValue,
          gst: input.gst,
          total,
          status: "ISSUED",
          issueDate,
          createdById: oid(actor.id),
          createdByName: actor.name,
        },
      ],
      { session }
    );
    await postJournal(session, {
      date: issueDate,
      channel: "ERP",
      referenceType: "DEBIT_NOTE",
      referenceId: note!.id,
      referenceLabel: debitNoteNo,
      narration: `Debit note ${debitNoteNo} — ${supplier.name}${supplierInvoiceNo ? ` (${supplierInvoiceNo})` : ""}`,
      performedBy: actor.id,
      performedByName: actor.name,
      lines: [
        { role: "ACCOUNTS_PAYABLE", direction: "DEBIT", amount: total },
        { role: "INVENTORY", direction: "CREDIT", amount: input.taxableValue },
        { role: "GST_RECEIVABLE", direction: "CREDIT", amount: input.gst },
      ],
    });
    return note!;
  });
  await audit(actor, AUDIT_ACTIONS.ACCOUNTING_DEBIT_NOTE_ISSUED, "DebitNote", doc.id, { debitNoteNo, supplier: supplier.name, total, reason: input.reason });
  return debitNoteView(doc.toObject());
}

export async function cancelDebitNote(id: string, actor: Actor, reason: string): Promise<DebitNote> {
  const note = await requireDebitNote(id);
  if (note.status !== "ISSUED") throw new ConflictError(`${note.debitNoteNo} is already ${note.status.toLowerCase()}.`);
  const original = await AccountingEntryModel.findOne({ referenceType: "DEBIT_NOTE", referenceId: note._id });

  const updated = await withInventoryTransaction(async (session) => {
    if (original) await reverseJournal(session, original.id, { performedBy: actor.id, performedByName: actor.name, reason: `Debit note cancelled: ${reason}` });
    const doc = await DebitNoteModel.findOneAndUpdate({ _id: note._id, status: "ISSUED" }, { $set: { status: "CANCELLED", cancelledReason: reason } }, { new: true, session });
    if (!doc) throw new ConflictError(`${note.debitNoteNo} changed — please look again.`);
    return doc;
  });
  await audit(actor, AUDIT_ACTIONS.ACCOUNTING_DEBIT_NOTE_CANCELLED, "DebitNote", updated.id, { debitNoteNo: updated.debitNoteNo, reason });
  return debitNoteView(updated.toObject());
}

export async function requireDebitNote(id: string): Promise<DebitNoteDocument> {
  const doc = await DebitNoteModel.findById(id);
  if (!doc) throw new NotFoundError("Debit note", id);
  return doc;
}
export async function getDebitNote(id: string): Promise<DebitNote> {
  return debitNoteView((await requireDebitNote(id)).toObject());
}
export async function listDebitNotes(filter: { supplierId?: string; status?: string } = {}): Promise<DebitNote[]> {
  const query: Record<string, unknown> = {};
  if (filter.supplierId) query.supplierId = filter.supplierId;
  if (filter.status) query.status = { $in: filter.status.split(",") };
  const docs = await DebitNoteModel.find(query).sort({ createdAt: -1 }).limit(200).lean();
  return docs.map((d) => debitNoteView(d as never));
}
