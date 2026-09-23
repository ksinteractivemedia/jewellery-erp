import type { Id, Paise } from "./common";
import type { AgeingBuckets, InvoicePaymentStatus } from "./b2b";

/**
 * The first accounting layer: a real double-entry general ledger (`ChartOfAccount` +
 * `AccountingEntry`), fed by ONE shared posting abstraction so the same accounting logic never
 * gets duplicated between the sales side (B2B invoicing/payments) and the purchase side
 * (supplier invoices/payments) — see `apps/api/src/modules/accounting/posting.service.ts`.
 * Deliberately NOT a full accounting package: no multi-currency, no cost centres, no budgets,
 * no tax filing reports — just the ledger a jewellery ERP needs under its existing commercial
 * documents (B2BInvoice, SupplierInvoice, B2BPayment, SupplierPayment), which this layer posts
 * from rather than replaces.
 */
export const ACCOUNT_TYPES = ["ASSET", "LIABILITY", "EQUITY", "INCOME", "EXPENSE"] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

/**
 * The fixed vocabulary of roles the posting engine understands. It never resolves "the AR
 * account" by a hardcoded id — it looks up whichever `ChartOfAccount` currently holds that role
 * (`chart-of-accounts.service.ts`'s `requireSystemAccount`), the same "configuration data, never
 * hardcoded" discipline as `AssayingCentre`/`TaxRule` elsewhere in this codebase. At most one
 * active account may hold a given role.
 */
export const SYSTEM_ACCOUNT_ROLES = [
  "CASH",
  "BANK",
  "ACCOUNTS_RECEIVABLE",
  "ACCOUNTS_PAYABLE",
  "INVENTORY",
  "SALES",
  "PURCHASES",
  "COST_OF_GOODS_SOLD",
  "GST_PAYABLE",
  "GST_RECEIVABLE",
  "DISCOUNT_GIVEN",
] as const;
export type SystemAccountRole = (typeof SYSTEM_ACCOUNT_ROLES)[number];

export const DEBIT_CREDIT = ["DEBIT", "CREDIT"] as const;
export type DebitCredit = (typeof DEBIT_CREDIT)[number];

export interface ChartOfAccount {
  id: Id;
  code: string;
  name: string;
  type: AccountType;
  /** Set only for the small set of accounts the posting engine drives automatically. */
  systemRole?: SystemAccountRole;
  description?: string;
  /** A system account's role can't be repointed by deleting/recreating it; it can still be renamed or deactivated once nothing posts to it. */
  isSystem: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export const JOURNAL_REFERENCE_TYPES = ["SALES_INVOICE", "PAYMENT_RECEIVED", "PURCHASE_INVOICE", "PAYMENT_MADE", "CREDIT_NOTE", "DEBIT_NOTE", "MANUAL"] as const;
export type JournalReferenceType = (typeof JOURNAL_REFERENCE_TYPES)[number];

export interface AccountingEntryLine {
  accountId: Id;
  /** Snapshot of the account's code/name at posting time — an account renamed later must never rewrite history. */
  accountCode: string;
  accountName: string;
  direction: DebitCredit;
  amount: Paise;
}

/**
 * One balanced journal entry — a header (what happened, and why) plus its lines (debits = credits,
 * always). Append-only, exactly like `InventoryLedger`/`Transaction`: a correction is a new,
 * opposite entry, never an edit (business-rules.md §8.2 / §20.4).
 */
export interface AccountingEntry {
  id: Id;
  journalNo: string;
  /** Business day (IST) this entry is dated on. */
  date: string;
  channel: "B2C" | "B2B" | "ERP";
  referenceType: JournalReferenceType;
  referenceId?: Id;
  /** The commercial document's own number (invoice/payment/etc.), for display without a join. */
  referenceLabel?: string;
  narration: string;
  lines: AccountingEntryLine[];
  totalDebit: Paise;
  totalCredit: Paise;
  performedBy: Id;
  performedByName?: string;
  createdAt: string;
}

// ---- credit / debit notes ----------------------------------------------------------------------

export const CREDIT_NOTE_STATUSES = ["ISSUED", "CANCELLED"] as const;
export type CreditNoteStatus = (typeof CREDIT_NOTE_STATUSES)[number];
export const CREDIT_NOTE_REASONS = ["SALES_RETURN", "PRICE_ADJUSTMENT", "GOODWILL", "OTHER"] as const;
export type CreditNoteReason = (typeof CREDIT_NOTE_REASONS)[number];

/** Reduces what a customer owes (or is owed back) — a sales return, an agreed price correction, or goodwill. Always posts against AR. */
export interface CreditNote {
  id: Id;
  creditNoteNo: string;
  customerId: Id;
  customerName: string;
  invoiceId?: Id;
  invoiceNo?: string;
  returnId?: Id;
  returnNo?: string;
  reason: CreditNoteReason;
  reasonNote?: string;
  taxableValue: Paise;
  gst: Paise;
  total: Paise;
  status: CreditNoteStatus;
  issueDate: string;
  cancelledReason?: string;
  createdByName?: string;
  createdAt: string;
}

export const DEBIT_NOTE_REASONS = ["PURCHASE_RETURN", "PRICE_ADJUSTMENT", "SHORT_SUPPLY", "OTHER"] as const;
export type DebitNoteReason = (typeof DEBIT_NOTE_REASONS)[number];

/** The purchase-side mirror of a CreditNote — reduces what the business owes a supplier. Always posts against AP. */
export interface DebitNote {
  id: Id;
  debitNoteNo: string;
  supplierId: Id;
  supplierName: string;
  supplierInvoiceId?: Id;
  supplierInvoiceNo?: string;
  reason: DebitNoteReason;
  reasonNote?: string;
  taxableValue: Paise;
  gst: Paise;
  total: Paise;
  status: "ISSUED" | "CANCELLED";
  issueDate: string;
  cancelledReason?: string;
  createdByName?: string;
  createdAt: string;
}

// ---- payments, as the accounting layer sees them (backed by B2BPayment/SupplierPayment — never duplicated) ------------------

export type PaymentDirection = "RECEIVED" | "PAID";
/** One row per B2BPayment or SupplierPayment, unified for the accounting screens — the underlying record and its workflow are each channel's own, unchanged. */
export interface PaymentSummary {
  id: Id;
  paymentNo: string;
  direction: PaymentDirection;
  channel: "B2B" | "PROCUREMENT";
  partyId: Id;
  partyName: string;
  method: string;
  amount: Paise;
  allocated: Paise;
  unapplied: Paise;
  status: string;
  date: string;
}
export interface PaymentAllocationSummary {
  paymentId: Id;
  paymentNo: string;
  invoiceId: Id;
  invoiceNo: string;
  amount: Paise;
  at: string;
  reversedAt?: string;
}

// ---- receivables dashboard / ageing / trial balance --------------------------------------------

export interface ReceivablesSummary {
  totalOutstanding: Paise;
  totalOverdue: Paise;
  overdueInvoiceCount: number;
  openInvoiceCount: number;
  customersWithOutstanding: number;
  ageing: AgeingBuckets;
}

export interface OutstandingInvoiceRow {
  invoiceId: Id;
  invoiceNo: string;
  customerId: Id;
  customerName: string;
  issueDate: string;
  dueDate: string;
  total: Paise;
  paid: Paise;
  balance: Paise;
  status: InvoicePaymentStatus;
  daysOverdue: number;
}

export interface CustomerAgeing {
  customerId: Id;
  customerName: string;
  ageing: AgeingBuckets;
  total: Paise;
}

export interface AgeingReport {
  asOf: string;
  overall: AgeingBuckets;
  byCustomer: CustomerAgeing[];
}

export interface TrialBalanceRow {
  accountId: Id;
  code: string;
  name: string;
  type: AccountType;
  debit: Paise;
  credit: Paise;
  /** Debit − credit for an ASSET/EXPENSE account, credit − debit for LIABILITY/EQUITY/INCOME — the sign a normal balance is shown in. */
  balance: Paise;
}
export interface TrialBalance {
  asOf: string;
  rows: TrialBalanceRow[];
  totalDebit: Paise;
  totalCredit: Paise;
}
