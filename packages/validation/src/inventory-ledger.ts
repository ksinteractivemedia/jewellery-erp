import { z } from "zod";
import { zGrams, zId } from "./common";
import { inventoryStatusSchema } from "./inventory-item";
import { movementTypeSchema } from "./transaction";

/**
 * One append-only ledger line. `quantity`/weights are signed deltas — the service layer
 * computes them from the item's current state, a caller never supplies them directly
 * (see inventory-transaction.service.ts in apps/api).
 */
export const createInventoryLedgerEntrySchema = z
  .object({
    transactionId: zId,
    itemId: zId,
    movementType: movementTypeSchema,
    quantity: z.number().int(),
    grossWeight: z.number().finite(),
    netWeight: z.number().finite(),
    fineWeight: z.number().finite(),
    fromStatus: inventoryStatusSchema.optional(),
    toStatus: inventoryStatusSchema,
    sourceLocationId: zId.optional(),
    destinationLocationId: zId.optional(),
  })
  .refine((data) => data.sourceLocationId || data.destinationLocationId, {
    message: "at least one of sourceLocationId or destinationLocationId is required",
    path: ["destinationLocationId"],
  });
export type CreateInventoryLedgerEntryInput = z.input<typeof createInventoryLedgerEntrySchema>;

// No update/delete schema — InventoryLedger is append-only from the application
// perspective (business-rules.md §2.1). Enforced again at the Mongoose layer, not just here.

/** The public-ish contract for posting a stock movement — see inventory-transaction.service.ts. */
export const postInventoryTransactionSchema = z.object({
  type: movementTypeSchema,
  channel: z.enum(["ERP", "B2C", "B2B"]),
  referenceType: z.enum([
    "ORDER",
    "INVOICE",
    "CUSTOMER_PURCHASE_ORDER",
    "SUPPLIER_PURCHASE_ORDER",
    "GOODS_RECEIPT",
    "PRODUCTION_ORDER",
    "JOB_WORK_ORDER",
    "ADJUSTMENT",
    "MANUAL",
  ]),
  referenceId: zId.optional(),
  performedBy: zId,
  reason: z.string().optional(),
  lines: z
    .array(
      z.object({
        itemId: zId,
        movementType: movementTypeSchema.optional(),
        toStatus: inventoryStatusSchema,
        destinationLocationId: zId.optional(),
        /** Only meaningful for BATCH items — how much of the batch this line moves. Omit for UNIT items (the whole item moves). */
        quantityDelta: z.number().positive().optional(),
        weightDelta: zGrams.optional(),
      })
    )
    .min(1),
});
export type PostInventoryTransactionInput = z.input<typeof postInventoryTransactionSchema>;
