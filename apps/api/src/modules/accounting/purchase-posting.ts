import type { ClientSession } from "mongoose";
import { postJournal } from "./posting.service";
import type { AccountingEntryDocument } from "./accounting-entry.model";

export interface PurchaseInvoicePostingInput {
  date: string;
  supplierInvoiceId: string;
  supplierInvoiceNo: string;
  performedBy: string;
  performedByName?: string;
  /** Sum of the invoice's ledger-tracked lines' value (gold/silver/platinum/stone/raw material/finished jewellery — everything that becomes a real InventoryItem). */
  inventoryValue: number;
  /** Sum of its CONSUMABLE lines' value — expensed, never becomes stock (procurement-core.ts's own `isLedgerTracked` split, not re-decided here). */
  purchasesValue: number;
  /** The invoice's entered tax amount — booked as recoverable input credit, not folded into the cost of the goods. */
  gstReceivable: number;
  total: number;
}

/**
 * Every recorded supplier invoice posts through here, at the point the liability actually arises
 * (the bill, not the earlier goods receipt — goods may arrive before their invoice does): Dr
 * Inventory (for stock-becoming lines), Dr Purchases (for consumables), Dr GST Receivable (input
 * credit), Cr Accounts Payable.
 */
export async function postPurchaseInvoice(session: ClientSession, input: PurchaseInvoicePostingInput): Promise<AccountingEntryDocument> {
  return postJournal(session, {
    date: input.date,
    channel: "ERP",
    referenceType: "PURCHASE_INVOICE",
    referenceId: input.supplierInvoiceId,
    referenceLabel: input.supplierInvoiceNo,
    narration: `Purchase — supplier invoice ${input.supplierInvoiceNo}`,
    performedBy: input.performedBy,
    ...(input.performedByName ? { performedByName: input.performedByName } : {}),
    lines: [
      { role: "INVENTORY", direction: "DEBIT", amount: input.inventoryValue },
      { role: "PURCHASES", direction: "DEBIT", amount: input.purchasesValue },
      { role: "GST_RECEIVABLE", direction: "DEBIT", amount: input.gstReceivable },
      { role: "ACCOUNTS_PAYABLE", direction: "CREDIT", amount: input.total },
    ],
  });
}

export interface PaymentMadePostingInput {
  date: string;
  supplierPaymentId: string;
  supplierPaymentNo: string;
  performedBy: string;
  performedByName?: string;
  amount: number;
  method: string;
}

/** A recorded payment allocated to supplier invoices: Dr AP, Cr Cash/Bank — the amount actually applied. */
export async function postPaymentMade(session: ClientSession, input: PaymentMadePostingInput): Promise<AccountingEntryDocument> {
  return postJournal(session, {
    date: input.date,
    channel: "ERP",
    referenceType: "PAYMENT_MADE",
    referenceId: input.supplierPaymentId,
    referenceLabel: input.supplierPaymentNo,
    narration: `Payment made — ${input.supplierPaymentNo}`,
    performedBy: input.performedBy,
    ...(input.performedByName ? { performedByName: input.performedByName } : {}),
    lines: [
      { role: "ACCOUNTS_PAYABLE", direction: "DEBIT", amount: input.amount },
      { role: input.method === "CASH" ? "CASH" : "BANK", direction: "CREDIT", amount: input.amount },
    ],
  });
}
