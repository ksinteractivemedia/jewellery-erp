import { Types } from "mongoose";
import type { CreditNote } from "@jewellery/types";
import type { CreateCreditNoteInput } from "@jewellery/validation";
import { ConflictError, NotFoundError } from "../../shared/errors";
import { formatDocumentNumber, nextSequence } from "../../shared/counters";
import { businessDay } from "../dashboard/range";
import { withInventoryTransaction } from "../inventory/inventory-transaction.service";
import { CustomerModel } from "../customers/customer.model";
import { InvoiceModel } from "../b2b/b2b.models";
import { AUDIT_ACTIONS } from "../audit/audit.service";
import { AccountingEntryModel } from "./accounting-entry.model";
import { creditNoteView } from "./accounting-views";
import { audit, type Actor } from "./accounting-store";
import { postJournal, reverseJournal } from "./posting.service";
import { CreditNoteModel, type CreditNoteDocument } from "./credit-note.model";

const oid = (v: string) => new Types.ObjectId(v);

/**
 * A credit note reduces what a customer owes — a sales return, an agreed price correction, or
 * goodwill. It always credits Accounts Receivable (business-rules.md §20.5): even a "store
 * credit" is modelled as a credit balance sitting on the customer's own AR account rather than a
 * separate liability, a deliberate simplification for this first accounting layer.
 */
export async function createCreditNote(actor: Actor, input: CreateCreditNoteInput): Promise<CreditNote> {
  const customer = await CustomerModel.findById(input.customerId).select("name type").lean();
  if (!customer || customer.type !== "B2B") throw new NotFoundError("Customer", input.customerId);
  let invoiceNo: string | undefined;
  if (input.invoiceId) {
    const inv = await InvoiceModel.findOne({ _id: input.invoiceId, customerId: input.customerId }).select("invoiceNo").lean();
    if (!inv) throw new NotFoundError("Invoice", input.invoiceId);
    invoiceNo = inv.invoiceNo;
  }
  const issueDate = input.issueDate ?? businessDay(new Date());
  const total = input.taxableValue + input.gst;
  const creditNoteNo = formatDocumentNumber("CN", await nextSequence("accounting-CN"));

  const doc = await withInventoryTransaction(async (session) => {
    const [note] = await CreditNoteModel.create(
      [
        {
          creditNoteNo,
          customerId: oid(input.customerId),
          customerName: customer.name,
          ...(input.invoiceId ? { invoiceId: oid(input.invoiceId), invoiceNo } : {}),
          ...(input.returnId ? { returnId: oid(input.returnId) } : {}),
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
      channel: "B2B",
      referenceType: "CREDIT_NOTE",
      referenceId: note!.id,
      referenceLabel: creditNoteNo,
      narration: `Credit note ${creditNoteNo} — ${customer.name}${invoiceNo ? ` (${invoiceNo})` : ""}`,
      performedBy: actor.id,
      performedByName: actor.name,
      lines: [
        { role: "SALES", direction: "DEBIT", amount: input.taxableValue },
        { role: "GST_PAYABLE", direction: "DEBIT", amount: input.gst },
        { role: "ACCOUNTS_RECEIVABLE", direction: "CREDIT", amount: total },
      ],
    });
    return note!;
  });
  await audit(actor, AUDIT_ACTIONS.ACCOUNTING_CREDIT_NOTE_ISSUED, "CreditNote", doc.id, { creditNoteNo, customer: customer.name, total, reason: input.reason });
  return creditNoteView(doc.toObject());
}

export async function cancelCreditNote(id: string, actor: Actor, reason: string): Promise<CreditNote> {
  const note = await requireCreditNote(id);
  if (note.status !== "ISSUED") throw new ConflictError(`${note.creditNoteNo} is already ${note.status.toLowerCase()}.`);
  const original = await AccountingEntryModel.findOne({ referenceType: "CREDIT_NOTE", referenceId: note._id });

  const updated = await withInventoryTransaction(async (session) => {
    if (original) await reverseJournal(session, original.id, { performedBy: actor.id, performedByName: actor.name, reason: `Credit note cancelled: ${reason}` });
    const doc = await CreditNoteModel.findOneAndUpdate({ _id: note._id, status: "ISSUED" }, { $set: { status: "CANCELLED", cancelledReason: reason } }, { new: true, session });
    if (!doc) throw new ConflictError(`${note.creditNoteNo} changed — please look again.`);
    return doc;
  });
  await audit(actor, AUDIT_ACTIONS.ACCOUNTING_CREDIT_NOTE_CANCELLED, "CreditNote", updated.id, { creditNoteNo: updated.creditNoteNo, reason });
  return creditNoteView(updated.toObject());
}

export async function requireCreditNote(id: string): Promise<CreditNoteDocument> {
  const doc = await CreditNoteModel.findById(id);
  if (!doc) throw new NotFoundError("Credit note", id);
  return doc;
}
export async function getCreditNote(id: string): Promise<CreditNote> {
  return creditNoteView((await requireCreditNote(id)).toObject());
}
export async function listCreditNotes(filter: { customerId?: string; status?: string } = {}): Promise<CreditNote[]> {
  const query: Record<string, unknown> = {};
  if (filter.customerId) query.customerId = filter.customerId;
  if (filter.status) query.status = { $in: filter.status.split(",") };
  const docs = await CreditNoteModel.find(query).sort({ createdAt: -1 }).limit(200).lean();
  return docs.map((d) => creditNoteView(d as never));
}
