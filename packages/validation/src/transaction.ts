import { z } from "zod";
import { zChannel, zId } from "./common";

export const movementTypeSchema = z.enum([
  "PURCHASE",
  "GOODS_RECEIPT",
  "SALE",
  "RETURN",
  "EXCHANGE",
  "TRANSFER",
  "ADJUSTMENT",
  "MANUFACTURING_ISSUE",
  "MANUFACTURING_RECEIPT",
  "JOB_WORK_ISSUE",
  "JOB_WORK_RECEIPT",
  "HALLMARKING_OUT",
  "HALLMARKING_IN",
  "REPAIR_OUT",
  "REPAIR_IN",
  "SCRAP",
  "MELTING",
]);

export const referenceTypeSchema = z.enum([
  "ORDER",
  "INVOICE",
  "CUSTOMER_PURCHASE_ORDER",
  "SUPPLIER_PURCHASE_ORDER",
  "GOODS_RECEIPT",
  "PRODUCTION_ORDER",
  "JOB_WORK_ORDER",
  "ADJUSTMENT",
  "MANUAL",
]);

export const createTransactionSchema = z.object({
  type: movementTypeSchema,
  channel: zChannel,
  referenceType: referenceTypeSchema,
  referenceId: zId.optional(),
  performedBy: zId,
  reason: z.string().optional(),
});
export type CreateTransactionInput = z.input<typeof createTransactionSchema>;

// No update schema — Transaction is append-only (business-rules.md §2.1, §6.3).
