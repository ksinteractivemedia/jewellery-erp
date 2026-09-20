import { z } from "zod";
import { zId } from "./common";
import { inventoryStatusSchema } from "./inventory-item";
import { movementTypeSchema, referenceTypeSchema } from "./transaction";

const zBalance = z.object({
  quantity: z.number().int().nonnegative(),
  grossWeight: z.number().finite().nonnegative(),
  stoneWeight: z.number().finite().nonnegative(),
  netWeight: z.number().finite().nonnegative(),
  fineWeight: z.number().finite().nonnegative(),
});

/**
 * One append-only ledger line. `quantity`/weights are signed deltas and `balanceAfter` the
 * item's totals right after — the service layer computes all of it from the item's current
 * state, a caller never supplies them directly (see inventory-transaction.service.ts in apps/api).
 */
export const createInventoryLedgerEntrySchema = z
  .object({
    transactionId: zId,
    itemId: zId,
    movementType: movementTypeSchema,
    sequence: z.number().int().positive(),
    quantity: z.number().int(),
    grossWeight: z.number().finite(),
    netWeight: z.number().finite(),
    fineWeight: z.number().finite(),
    balanceAfter: zBalance,
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

export const MAX_MOVEMENT_ITEMS = 100;

export const itemReservationInputSchema = z.object({
  referenceType: z.enum(["ORDER", "CUSTOMER_PURCHASE_ORDER", "MANUAL"]),
  referenceId: zId,
  expiresAt: z.coerce.date().optional(),
});

/**
 * The contract for posting a stock movement — see inventory-transaction.service.ts. The caller
 * names the movement; the movement rules (movement-rules.ts) decide which statuses it may go
 * from and to, so `toStatus` is optional whenever the movement implies exactly one.
 */
export const postInventoryTransactionSchema = z.object({
  type: movementTypeSchema,
  channel: z.enum(["ERP", "B2C", "B2B"]),
  referenceType: referenceTypeSchema,
  referenceId: zId.optional(),
  performedBy: zId,
  reason: z.string().trim().max(500).optional(),
  lines: z
    .array(
      z.object({
        itemId: zId,
        movementType: movementTypeSchema.optional(),
        toStatus: inventoryStatusSchema.optional(),
        destinationLocationId: zId.optional(),
        /**
         * BATCH items only — signed change to the batch (negative = material leaving). Omit for UNIT
         * items (the whole piece moves as one).
         */
        quantityDelta: z
          .number()
          .finite()
          .refine((v) => v !== 0, "quantityDelta cannot be zero")
          .optional(),
        weightDelta: z
          .number()
          .finite()
          .refine((v) => v !== 0, "weightDelta cannot be zero")
          .optional(),
        /** ADJUSTMENT on a UNIT item: the re-weighed values (net/fine are re-derived). */
        setGrossWeight: z.number().finite().positive().optional(),
        setStoneWeight: z.number().finite().nonnegative().optional(),
        /** RESERVATION sets it, RELEASE_RESERVATION/SALE clear it. */
        reservation: itemReservationInputSchema.optional(),
        /** HALLMARKING_IN: the mark that came back. */
        huid: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{6}$/).optional(),
        /** Internal: a caller allowed to act on a hold that isn't theirs (force-release, expiry sweep). */
        overrideReservation: z.boolean().optional(),
        /** Optimistic guard: refuse if the item has moved since the caller read it. */
        expectedLedgerSeq: z.number().int().nonnegative().optional(),
      })
    )
    .min(1)
    .max(MAX_MOVEMENT_ITEMS)
    .refine((lines) => new Set(lines.map((l) => l.itemId)).size === lines.length, "an item can appear only once per transaction"),
});
export type PostInventoryTransactionInput = z.input<typeof postInventoryTransactionSchema>;
