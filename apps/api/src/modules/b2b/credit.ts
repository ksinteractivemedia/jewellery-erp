import type { AgeingBuckets, CreditCheck, CreditPosition, CreditReason, InvoicePaymentStatus, Paise } from "@jewellery/types";
import { daysBetween } from "../dashboard/range";

export interface CreditInputs {
  limit: Paise;
  onHold: boolean;
  blockOnOverdue: boolean;
  /** Unpaid invoices: what is still owed, and the business day it fell due. */
  invoices: { balance: Paise; dueDate: string }[];
  /** Totals of orders that are approved but not yet invoiced. */
  committedOrders: Paise[];
  /** Today, as a business day (IST). */
  today: string;
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
/** An invoice is overdue the day AFTER its due date, not on it (business-rules.md §9.3). */
export const isOverdue = (dueDate: string, today: string) => daysBetween(dueDate, today) > 0;

/**
 * Where a customer stands against their limit. Outstanding is what invoices still owe; committed is what has been promised
 * on approved orders that haven't been invoiced yet — without it, ten orders approved before any is invoiced would each look
 * fine on their own. `available` may be negative: that is "over the limit", and the number says by how much.
 */
export function creditPosition(i: CreditInputs): CreditPosition {
  const outstanding = sum(i.invoices.map((x) => x.balance));
  const committed = sum(i.committedOrders);
  const overdue = sum(i.invoices.filter((x) => isOverdue(x.dueDate, i.today)).map((x) => x.balance));
  return { limit: i.limit, outstanding, committed, available: i.limit - outstanding - committed, overdue, onHold: i.onHold, blockOnOverdue: i.blockOnOverdue };
}

const rupees = (paise: number) => `₹${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

/**
 * Would approving an order of `orderAmount` breach the account's terms? Any reason means the order needs a credit override
 * from someone entitled to give one. The messages say what to DO, because a warning nobody can act on is noise.
 */
export function checkCredit(position: CreditPosition, orderAmount: Paise): CreditCheck {
  const exposureAfter = position.outstanding + position.committed + orderAmount;
  const wouldExceedBy = Math.max(0, exposureAfter - position.limit);
  const reasons: CreditReason[] = [];
  if (position.onHold) reasons.push({ code: "ACCOUNT_ON_HOLD", message: "This account is on credit hold.", action: "Contact your salesperson to have the hold lifted." });
  if (wouldExceedBy > 0) {
    reasons.push({
      code: "CREDIT_LIMIT_EXCEEDED",
      message: `This order takes you ${rupees(wouldExceedBy)} over your credit limit of ${rupees(position.limit)}.`,
      action: position.outstanding > 0 ? `Pay ${rupees(Math.min(wouldExceedBy, position.outstanding))} of your outstanding invoices, reduce the order, or ask for a limit increase.` : "Reduce the order or ask your salesperson for a limit increase.",
    });
  }
  if (position.blockOnOverdue && position.overdue > 0) reasons.push({ code: "OVERDUE_INVOICES", message: `You have ${rupees(position.overdue)} overdue.`, action: "Settle your overdue invoices, or contact your salesperson." });
  return { position, orderAmount, exposureAfter, wouldExceedBy, reasons, requiresApproval: reasons.length > 0 };
}

// ---- invoices ---------------------------------------------------------------------------------
export function invoiceStatus(i: { total: Paise; paid: Paise; dueDate: string; today: string; cancelled?: boolean }): InvoicePaymentStatus {
  if (i.cancelled) return "CANCELLED";
  const balance = i.total - i.paid;
  if (balance <= 0) return "PAID";
  if (isOverdue(i.dueDate, i.today)) return "OVERDUE";
  return i.paid > 0 ? "PARTIALLY_PAID" : "UNPAID";
}

/** Outstanding balances by how long past due they are. Not-yet-due money is "current". */
export function ageInvoices(invoices: { balance: Paise; dueDate: string }[], today: string): AgeingBuckets {
  const b: AgeingBuckets = { current: 0, days1to30: 0, days31to60: 0, days61to90: 0, over90: 0 };
  for (const inv of invoices) {
    if (inv.balance <= 0) continue;
    const late = daysBetween(inv.dueDate, today);
    if (late <= 0) b.current += inv.balance;
    else if (late <= 30) b.days1to30 += inv.balance;
    else if (late <= 60) b.days31to60 += inv.balance;
    else if (late <= 90) b.days61to90 += inv.balance;
    else b.over90 += inv.balance;
  }
  return b;
}
export const daysOverdue = (dueDate: string, today: string) => Math.max(0, daysBetween(dueDate, today));
