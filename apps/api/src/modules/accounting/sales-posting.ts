import type { ClientSession } from "mongoose";
import { InventoryItemModel } from "../inventory/inventory-item.model";
import { postJournal } from "./posting.service";
import type { AccountingEntryDocument } from "./accounting-entry.model";

export interface SalesInvoicePostingInput {
  channel: "B2C" | "B2B";
  date: string;
  invoiceId: string;
  invoiceNo: string;
  performedBy: string;
  performedByName?: string;
  /** Pre-discount taxable value — what Sales is credited at (business-rules.md §20.2: discount is its own line, never netted invisibly into revenue). */
  grossSales: number;
  discount: number;
  gst: number;
  /** grossSales − discount + gst — what AR is debited (exactly what the customer now owes). */
  total: number;
  /** The exact InventoryItems sold on this invoice — their own book cost drives the COGS/Inventory entry, never a recomputed estimate. */
  soldItemIds: string[];
}

/**
 * Every completed B2B sale posts through here (`fulfilment.service.ts`'s `invoice()`, in the same
 * session as the ledger `SALE` and the `Invoice` document): Dr AR (what's owed), Dr Discount Given,
 * Cr Sales (gross, pre-discount), Cr GST Payable — and, because this system tracks inventory
 * perpetually (every `InventoryItem` already carries its own `cost`), Dr Cost of Goods Sold / Cr
 * Inventory at the sold pieces' actual book cost, not a periodic estimate.
 */
export async function postSalesInvoice(session: ClientSession, input: SalesInvoicePostingInput): Promise<AccountingEntryDocument> {
  const cost = input.soldItemIds.length
    ? (await InventoryItemModel.find({ _id: { $in: input.soldItemIds } }).select("cost").session(session).lean()).reduce((s, i) => s + i.cost, 0)
    : 0;
  return postJournal(session, {
    date: input.date,
    channel: input.channel,
    referenceType: "SALES_INVOICE",
    referenceId: input.invoiceId,
    referenceLabel: input.invoiceNo,
    narration: `Sale — invoice ${input.invoiceNo}`,
    performedBy: input.performedBy,
    ...(input.performedByName ? { performedByName: input.performedByName } : {}),
    lines: [
      { role: "ACCOUNTS_RECEIVABLE", direction: "DEBIT", amount: input.total },
      { role: "DISCOUNT_GIVEN", direction: "DEBIT", amount: input.discount },
      { role: "SALES", direction: "CREDIT", amount: input.grossSales },
      { role: "GST_PAYABLE", direction: "CREDIT", amount: input.gst },
      { role: "COST_OF_GOODS_SOLD", direction: "DEBIT", amount: cost },
      { role: "INVENTORY", direction: "CREDIT", amount: cost },
    ],
  });
}

export interface PaymentReceivedPostingInput {
  channel: "B2C" | "B2B";
  date: string;
  paymentId: string;
  paymentNo: string;
  performedBy: string;
  performedByName?: string;
  amount: number;
  /** CASH lands in the till; every other offline method (bank transfer, NEFT, RTGS, IMPS, cheque, other) is treated as reaching the bank account. */
  method: string;
}

/** A verified payment allocated to invoices: Dr Cash/Bank, Cr AR — the amount actually applied, not the payment's full face value (a partially-applied payment posts only what it settled). */
export async function postPaymentReceived(session: ClientSession, input: PaymentReceivedPostingInput): Promise<AccountingEntryDocument> {
  return postJournal(session, {
    date: input.date,
    channel: input.channel,
    referenceType: "PAYMENT_RECEIVED",
    referenceId: input.paymentId,
    referenceLabel: input.paymentNo,
    narration: `Payment received — ${input.paymentNo}`,
    performedBy: input.performedBy,
    ...(input.performedByName ? { performedByName: input.performedByName } : {}),
    lines: [
      { role: input.method === "CASH" ? "CASH" : "BANK", direction: "DEBIT", amount: input.amount },
      { role: "ACCOUNTS_RECEIVABLE", direction: "CREDIT", amount: input.amount },
    ],
  });
}
