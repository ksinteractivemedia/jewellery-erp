/**
 * The first accounting layer: a real double-entry general ledger (`ChartOfAccount` +
 * `AccountingEntry`) under the ERP's existing commercial documents. `posting.service.ts`'s
 * `postJournal` is the one transaction abstraction every completed financial event posts
 * through — `sales-posting.ts` (B2B invoicing, payment receipt) and `purchase-posting.ts`
 * (supplier invoices, payment made) call it with different lines, never different code.
 * `CreditNote`/`DebitNote` are their own append-only-adjacent documents (cancel = a reversing
 * entry, never an edit). Deliberately not a full accounting package: no multi-currency, no cost
 * centres, no manual free-form journal entries — every posting traces back to a real commercial
 * document.
 */
export * from "./chart-of-accounts.model";
export * from "./accounting-entry.model";
export * from "./credit-note.model";
export * from "./debit-note.model";
export type { Actor } from "./accounting-store";

export * as chartOfAccounts from "./chart-of-accounts.service";
export * as posting from "./posting.service";
export * as salesPosting from "./sales-posting";
export * as purchasePosting from "./purchase-posting";
export * as creditNotes from "./credit-note.service";
export * as debitNotes from "./debit-note.service";
export * as receivables from "./receivables-reads.service";
export * as reports from "./reports.service";
