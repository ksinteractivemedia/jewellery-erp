import { Types, type ClientSession } from "mongoose";
import type { AccountingEntry, JournalReferenceType, SystemAccountRole } from "@jewellery/types";
import { DomainValidationError } from "../../shared/errors";
import { formatDocumentNumber, nextSequence } from "../../shared/counters";
import { journalView } from "./accounting-views";
import { requireSystemAccount } from "./chart-of-accounts.service";
import { AccountingEntryModel, type AccountingEntryDocument } from "./accounting-entry.model";

/**
 * THE transaction abstraction (the task's own words): every completed financial event — a sales
 * invoice, a purchase invoice, a payment allocated in either direction, a credit or debit note —
 * posts through `postJournal`, the one place that resolves accounts by role, checks debits equal
 * credits, and writes the entry. Sales (`sales-posting.ts`) and purchases
 * (`purchase-posting.ts`) each call it with different *lines*, never different code — the same
 * discipline CLAUDE.md rule 1 sets for the pricing engine, applied to bookkeeping.
 */
export interface JournalLineInput {
  role: SystemAccountRole;
  direction: "DEBIT" | "CREDIT";
  /** Paise. A zero-amount line is simply omitted by the caller — never posted (it would be a no-op that still shows up in the ledger). */
  amount: number;
}
export interface PostJournalInput {
  date: string;
  channel: "B2C" | "B2B" | "ERP";
  referenceType: JournalReferenceType;
  referenceId?: string;
  referenceLabel?: string;
  narration: string;
  performedBy: string;
  performedByName?: string;
  lines: JournalLineInput[];
}

export const nextJournalNo = async () => formatDocumentNumber("JE", await nextSequence("accounting-JE"));

/**
 * Resolves each line's account by its system role, refuses anything that doesn't balance to the
 * paisa, and writes one append-only entry. Runs inside the caller's own session, so it commits
 * atomically with whatever document (invoice, payment, note) triggered it — the same
 * `withInventoryTransaction`-and-session pattern the inventory ledger uses, so "the invoice was
 * created but its accounting entry wasn't" can never happen.
 */
export async function postJournal(session: ClientSession, input: PostJournalInput): Promise<AccountingEntryDocument> {
  const bad = input.lines.find((l) => !Number.isInteger(l.amount) || l.amount < 0);
  if (bad) throw new DomainValidationError(`Journal line amount must be a whole number of paise, got ${bad.amount}.`);
  const real = input.lines.filter((l) => l.amount > 0);
  if (real.length < 2) throw new DomainValidationError("A journal entry needs at least two non-zero lines.");
  const totalDebit = real.filter((l) => l.direction === "DEBIT").reduce((s, l) => s + l.amount, 0);
  const totalCredit = real.filter((l) => l.direction === "CREDIT").reduce((s, l) => s + l.amount, 0);
  if (totalDebit !== totalCredit) throw new DomainValidationError(`Journal entry does not balance: ₹${(totalDebit / 100).toFixed(2)} debit vs ₹${(totalCredit / 100).toFixed(2)} credit.`);

  const lines = await Promise.all(
    real.map(async (l) => {
      const account = await requireSystemAccount(l.role);
      return { accountId: account._id, accountCode: account.code, accountName: account.name, direction: l.direction, amount: l.amount };
    })
  );

  const [doc] = await AccountingEntryModel.create(
    [
      {
        journalNo: await nextJournalNo(),
        date: input.date,
        channel: input.channel,
        referenceType: input.referenceType,
        ...(input.referenceId ? { referenceId: new Types.ObjectId(input.referenceId) } : {}),
        ...(input.referenceLabel ? { referenceLabel: input.referenceLabel } : {}),
        narration: input.narration,
        lines,
        totalDebit,
        totalCredit,
        performedBy: new Types.ObjectId(input.performedBy),
        ...(input.performedByName ? { performedByName: input.performedByName } : {}),
      },
    ],
    { session }
  );
  return doc!;
}

/**
 * Undoes a posted entry with a new, opposite one — never an edit (the ledger is append-only, the
 * same rule as `InventoryLedger`). Used for a reversed payment, or a cancelled credit/debit note.
 */
export async function reverseJournal(session: ClientSession, originalJournalId: string, opts: { performedBy: string; performedByName?: string; reason: string }): Promise<AccountingEntryDocument> {
  const original = await AccountingEntryModel.findById(originalJournalId).session(session);
  if (!original) throw new DomainValidationError("The original journal entry to reverse could not be found.");
  const [doc] = await AccountingEntryModel.create(
    [
      {
        journalNo: await nextJournalNo(),
        date: original.date,
        channel: original.channel,
        referenceType: original.referenceType,
        referenceId: original.referenceId,
        referenceLabel: original.referenceLabel,
        narration: `Reversal of ${original.journalNo}: ${opts.reason}`,
        lines: original.lines.map((l) => ({ accountId: l.accountId, accountCode: l.accountCode, accountName: l.accountName, direction: l.direction === "DEBIT" ? "CREDIT" : "DEBIT", amount: l.amount })),
        totalDebit: original.totalCredit,
        totalCredit: original.totalDebit,
        performedBy: new Types.ObjectId(opts.performedBy),
        ...(opts.performedByName ? { performedByName: opts.performedByName } : {}),
      },
    ],
    { session }
  );
  return doc!;
}

export async function listJournal(filter: { accountId?: string; referenceType?: string; referenceId?: string; from?: string; to?: string } = {}): Promise<AccountingEntry[]> {
  const query: Record<string, unknown> = {};
  if (filter.accountId) query["lines.accountId"] = new Types.ObjectId(filter.accountId);
  if (filter.referenceType) query.referenceType = filter.referenceType;
  if (filter.referenceId) query.referenceId = new Types.ObjectId(filter.referenceId);
  if (filter.from || filter.to) query.date = { ...(filter.from ? { $gte: filter.from } : {}), ...(filter.to ? { $lte: filter.to } : {}) };
  const docs = await AccountingEntryModel.find(query).sort({ createdAt: -1 }).limit(500).lean();
  return docs.map((d) => journalView(d as never));
}
