import type { Types } from "mongoose";
import type { AccountingEntry, ChartOfAccount, CreditNote, DebitNote } from "@jewellery/types";
import type { AccountingEntryAttrs, AccountingEntryLineAttrs } from "./accounting-entry.model";
import type { ChartOfAccountAttrs } from "./chart-of-accounts.model";
import type { CreditNoteAttrs } from "./credit-note.model";
import type { DebitNoteAttrs } from "./debit-note.model";

const id = (v: unknown) => String(v);
const docId = (d: { _id?: unknown; id?: unknown }) => String(d.id ?? d._id);
export const iso = (d: Date | string) => (typeof d === "string" ? d : d.toISOString());

type WithId<T> = T & { _id: Types.ObjectId; id?: string; createdAt: Date };

const lineView = (l: AccountingEntryLineAttrs) => ({ accountId: id(l.accountId), accountCode: l.accountCode, accountName: l.accountName, direction: l.direction, amount: l.amount });

export function journalView(d: WithId<AccountingEntryAttrs>): AccountingEntry {
  return {
    id: docId(d),
    journalNo: d.journalNo,
    date: d.date,
    channel: d.channel,
    referenceType: d.referenceType,
    ...(d.referenceId ? { referenceId: id(d.referenceId) } : {}),
    ...(d.referenceLabel ? { referenceLabel: d.referenceLabel } : {}),
    narration: d.narration,
    lines: d.lines.map(lineView),
    totalDebit: d.totalDebit,
    totalCredit: d.totalCredit,
    performedBy: id(d.performedBy),
    ...(d.performedByName ? { performedByName: d.performedByName } : {}),
    createdAt: iso(d.createdAt),
  };
}

export function chartOfAccountView(d: WithId<ChartOfAccountAttrs>): ChartOfAccount {
  return {
    id: docId(d),
    code: d.code,
    name: d.name,
    type: d.type,
    ...(d.systemRole ? { systemRole: d.systemRole } : {}),
    ...(d.description ? { description: d.description } : {}),
    isSystem: d.isSystem,
    isActive: d.isActive,
    createdAt: iso(d.createdAt),
    updatedAt: iso(d.updatedAt),
  };
}

export function creditNoteView(d: WithId<CreditNoteAttrs>): CreditNote {
  return {
    id: docId(d),
    creditNoteNo: d.creditNoteNo,
    customerId: id(d.customerId),
    customerName: d.customerName,
    ...(d.invoiceId ? { invoiceId: id(d.invoiceId) } : {}),
    ...(d.invoiceNo ? { invoiceNo: d.invoiceNo } : {}),
    ...(d.returnId ? { returnId: id(d.returnId) } : {}),
    ...(d.returnNo ? { returnNo: d.returnNo } : {}),
    reason: d.reason,
    ...(d.reasonNote ? { reasonNote: d.reasonNote } : {}),
    taxableValue: d.taxableValue,
    gst: d.gst,
    total: d.total,
    status: d.status,
    issueDate: d.issueDate,
    ...(d.cancelledReason ? { cancelledReason: d.cancelledReason } : {}),
    ...(d.createdByName ? { createdByName: d.createdByName } : {}),
    createdAt: iso(d.createdAt),
  };
}

export function debitNoteView(d: WithId<DebitNoteAttrs>): DebitNote {
  return {
    id: docId(d),
    debitNoteNo: d.debitNoteNo,
    supplierId: id(d.supplierId),
    supplierName: d.supplierName,
    ...(d.supplierInvoiceId ? { supplierInvoiceId: id(d.supplierInvoiceId) } : {}),
    ...(d.supplierInvoiceNo ? { supplierInvoiceNo: d.supplierInvoiceNo } : {}),
    reason: d.reason,
    ...(d.reasonNote ? { reasonNote: d.reasonNote } : {}),
    taxableValue: d.taxableValue,
    gst: d.gst,
    total: d.total,
    status: d.status,
    issueDate: d.issueDate,
    ...(d.cancelledReason ? { cancelledReason: d.cancelledReason } : {}),
    ...(d.createdByName ? { createdByName: d.createdByName } : {}),
    createdAt: iso(d.createdAt),
  };
}
