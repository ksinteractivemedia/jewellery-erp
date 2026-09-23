import { Schema, Types, model, type HydratedDocument, type Model } from "mongoose";
import { DEBIT_CREDIT, JOURNAL_REFERENCE_TYPES } from "@jewellery/types";
import type { DebitCredit, JournalReferenceType } from "@jewellery/types";
import { appendOnlyPlugin } from "../../shared/append-only.plugin";
import { createdAtOnlySchemaOptions } from "../../shared/mongoose.helpers";

export interface AccountingEntryLineAttrs {
  accountId: Types.ObjectId;
  accountCode: string;
  accountName: string;
  direction: DebitCredit;
  amount: number;
}
const lineSchema = new Schema<AccountingEntryLineAttrs>(
  {
    accountId: { type: Schema.Types.ObjectId, ref: "ChartOfAccount", required: true },
    accountCode: { type: String, required: true },
    accountName: { type: String, required: true },
    direction: { type: String, enum: DEBIT_CREDIT, required: true },
    amount: { type: Number, required: true, min: 1 },
  },
  { _id: false }
);

/**
 * One balanced journal entry — a header plus its debit/credit lines. Append-only, exactly like
 * `InventoryLedger`/`Transaction` (business-rules.md §20.4): a correction is a new, opposite entry,
 * never an edit. `postJournal` (posting.service.ts) is the only writer, and refuses to write
 * anything where `sum(debits) !== sum(credits)`.
 */
export interface AccountingEntryAttrs {
  journalNo: string;
  date: string;
  channel: "B2C" | "B2B" | "ERP";
  referenceType: JournalReferenceType;
  referenceId?: Types.ObjectId;
  referenceLabel?: string;
  narration: string;
  lines: AccountingEntryLineAttrs[];
  totalDebit: number;
  totalCredit: number;
  performedBy: Types.ObjectId;
  performedByName?: string;
  createdAt: Date;
}
export type AccountingEntryDocument = HydratedDocument<AccountingEntryAttrs>;

const accountingEntrySchema = new Schema<AccountingEntryAttrs>(
  {
    journalNo: { type: String, required: true, unique: true },
    date: { type: String, required: true },
    channel: { type: String, enum: ["B2C", "B2B", "ERP"], required: true },
    referenceType: { type: String, enum: JOURNAL_REFERENCE_TYPES, required: true },
    referenceId: { type: Schema.Types.ObjectId },
    referenceLabel: String,
    narration: { type: String, required: true },
    lines: { type: [lineSchema], validate: (v: unknown[]) => v.length >= 2 },
    totalDebit: { type: Number, required: true, min: 0 },
    totalCredit: { type: Number, required: true, min: 0 },
    performedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    performedByName: String,
  },
  createdAtOnlySchemaOptions<AccountingEntryAttrs>()
);
accountingEntrySchema.index({ referenceType: 1, referenceId: 1 });
accountingEntrySchema.index({ "lines.accountId": 1, date: 1 });
accountingEntrySchema.index({ date: 1 });

accountingEntrySchema.plugin(appendOnlyPlugin, { entityName: "AccountingEntry" });

export const AccountingEntryModel: Model<AccountingEntryAttrs> = model<AccountingEntryAttrs>("AccountingEntry", accountingEntrySchema);
