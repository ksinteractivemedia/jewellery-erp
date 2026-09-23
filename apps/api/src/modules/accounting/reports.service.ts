import { Types } from "mongoose";
import type { TrialBalance } from "@jewellery/types";
import { businessDay } from "../dashboard/range";
import { AccountingEntryModel } from "./accounting-entry.model";
import { ChartOfAccountModel } from "./chart-of-accounts.model";

/**
 * The one honest check that every posting so far has actually balanced: debits should equal
 * credits, always, because `postJournal` refuses to write anything that doesn't. A trial balance
 * that doesn't balance would mean a bug in the posting engine, not in the business — it's the
 * proof, not just a report.
 */
export async function trialBalance(asOf?: string): Promise<TrialBalance> {
  const date = asOf ?? businessDay(new Date());
  const rows = await AccountingEntryModel.aggregate<{ _id: Types.ObjectId; debit: number; credit: number }>([
    { $match: { date: { $lte: date } } },
    { $unwind: "$lines" },
    { $group: { _id: "$lines.accountId", debit: { $sum: { $cond: [{ $eq: ["$lines.direction", "DEBIT"] }, "$lines.amount", 0] } }, credit: { $sum: { $cond: [{ $eq: ["$lines.direction", "CREDIT"] }, "$lines.amount", 0] } } } },
  ]);
  const accounts = await ChartOfAccountModel.find({ _id: { $in: rows.map((r) => r._id) } }).lean();
  const byId = new Map(accounts.map((a) => [String(a._id), a]));

  const out = rows
    .map((r) => {
      const acc = byId.get(String(r._id));
      const debitNormal = acc ? acc.type === "ASSET" || acc.type === "EXPENSE" : true;
      return {
        accountId: String(r._id),
        code: acc?.code ?? "?",
        name: acc?.name ?? "Unknown account",
        type: acc?.type ?? "ASSET",
        debit: r.debit,
        credit: r.credit,
        balance: debitNormal ? r.debit - r.credit : r.credit - r.debit,
      } as const;
    })
    .sort((a, b) => a.code.localeCompare(b.code));

  return { asOf: date, rows: out, totalDebit: out.reduce((s, r) => s + r.debit, 0), totalCredit: out.reduce((s, r) => s + r.credit, 0) };
}
