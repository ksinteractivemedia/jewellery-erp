import { z } from "zod";
import { zId, zPaise } from "./common";

const text = (max: number) => z.string().trim().min(1).max(max);

export const accountTypeSchema = z.enum(["ASSET", "LIABILITY", "EQUITY", "INCOME", "EXPENSE"]);

export const createChartOfAccountSchema = z
  .object({
    code: text(20),
    name: text(120),
    type: accountTypeSchema,
    description: text(300).optional(),
  })
  .strict();
export type CreateChartOfAccountInput = z.output<typeof createChartOfAccountSchema>;

/** A system account's code/type/role are fixed at creation (`chart-of-accounts.service.ts`'s sync); only what a business might reasonably want to change is editable. */
export const updateChartOfAccountSchema = z
  .object({
    name: text(120).optional(),
    description: text(300).optional(),
    isActive: z.boolean().optional(),
  })
  .strict();
export type UpdateChartOfAccountInput = z.output<typeof updateChartOfAccountSchema>;

export const creditNoteReasonSchema = z.enum(["SALES_RETURN", "PRICE_ADJUSTMENT", "GOODWILL", "OTHER"]);
export const createCreditNoteSchema = z
  .object({
    customerId: zId,
    invoiceId: zId.optional(),
    returnId: zId.optional(),
    reason: creditNoteReasonSchema,
    reasonNote: text(500).optional(),
    taxableValue: zPaise,
    gst: zPaise.default(0),
    issueDate: z.string().trim().optional(),
  })
  .strict();
export type CreateCreditNoteInput = z.output<typeof createCreditNoteSchema>;

export const debitNoteReasonSchema = z.enum(["PURCHASE_RETURN", "PRICE_ADJUSTMENT", "SHORT_SUPPLY", "OTHER"]);
export const createDebitNoteSchema = z
  .object({
    supplierId: zId,
    supplierInvoiceId: zId.optional(),
    reason: debitNoteReasonSchema,
    reasonNote: text(500).optional(),
    taxableValue: zPaise,
    gst: zPaise.default(0),
    issueDate: z.string().trim().optional(),
  })
  .strict();
export type CreateDebitNoteInput = z.output<typeof createDebitNoteSchema>;

export const cancelNoteSchema = z.object({ reason: text(500) }).strict();
export type CancelNoteInput = z.output<typeof cancelNoteSchema>;
