import { z } from "zod";
import { zChannel, zId } from "./common";

export const MOVEMENT_TYPES = [
  "PURCHASE_RECEIPT",
  "SALE",
  "RETURN",
  "TRANSFER_OUT",
  "TRANSFER_IN",
  "RESERVATION",
  "RELEASE_RESERVATION",
  "MANUFACTURING_ISSUE",
  "MANUFACTURING_RECEIPT",
  "JOBWORK_ISSUE",
  "JOBWORK_RECEIPT",
  "REPAIR_OUT",
  "REPAIR_IN",
  "HALLMARKING_OUT",
  "HALLMARKING_IN",
  "ADJUSTMENT",
  "SCRAP",
  "MELTING",
] as const;
export const movementTypeSchema = z.enum(MOVEMENT_TYPES);

export const REFERENCE_TYPES = [
  "ORDER",
  "INVOICE",
  "CUSTOMER_PURCHASE_ORDER",
  "SUPPLIER_PURCHASE_ORDER",
  "GOODS_RECEIPT",
  "PRODUCTION_ORDER",
  "JOB_WORK_ORDER",
  "STOCK_TRANSFER",
  "ADJUSTMENT",
  "MANUAL",
] as const;
export const referenceTypeSchema = z.enum(REFERENCE_TYPES);

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
