import type { B2BData } from "@jewellery/types";
import type { B2BFacts } from "./providers";

/**
 * B2B receivables position as of `now` — a snapshot, so no date range. Pending means still awaiting a decision;
 * outstanding is what customers owe on invoices; overdue is the part of that past its due date. Credit
 * utilisation is what customers have drawn against what they may draw (over 100% is possible, and shown).
 */
export function aggregateB2B(facts: B2BFacts, opts: { now: Date; branchId?: string }): B2BData {
  const inBranch = <T extends { branchId: string }>(rows: readonly T[]) => rows.filter((r) => !opts.branchId || r.branchId === opts.branchId);
  const pending = <T extends { status: string; value: number }>(rows: readonly T[]) => {
    const p = rows.filter((r) => r.status === "PENDING");
    return { count: p.length, value: p.reduce((t, r) => t + r.value, 0) };
  };

  const unpaid = inBranch(facts.invoices).map((i) => ({ ...i, balance: Math.max(i.total - i.paid, 0) })).filter((i) => i.balance > 0);
  const late = unpaid.filter((i) => i.dueDate < opts.now);
  const accounts = inBranch(facts.creditAccounts);
  const used = accounts.reduce((t, a) => t + a.used, 0);
  const limit = accounts.reduce((t, a) => t + a.limit, 0);

  return {
    pendingPurchaseOrders: pending(inBranch(facts.purchaseOrders)),
    pendingQuotations: pending(inBranch(facts.quotations)),
    outstanding: unpaid.reduce((t, i) => t + i.balance, 0),
    overdue: { amount: late.reduce((t, i) => t + i.balance, 0), invoices: late.length, customers: new Set(late.map((i) => i.customerId)).size },
    creditUtilization: { used, limit, percentage: limit === 0 ? null : Math.round((used * 1000) / limit) / 10 },
  };
}
