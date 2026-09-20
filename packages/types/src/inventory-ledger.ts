import type { Grams, Id } from "./common";
import type { InventoryStatus } from "./inventory-item";
import type { MovementType } from "./transaction";

/**
 * One append-only line of stock movement, tied to a Transaction header (architecture.md §4).
 * `referenceType`/`referenceId`/`performedBy`/`reason`/timestamp live on the Transaction —
 * not duplicated here — because they describe the business event, not the movement line;
 * see docs/data-model.md §2 for why this is two collections and not one flat one.
 *
 * Never updated or deleted after creation. No `updatedAt` on purpose.
 */
export interface InventoryLedgerEntry {
  id: Id;
  transactionId: Id;
  itemId: Id;
  movementType: MovementType;

  /** Signed. +1/-1 for UNIT items; the batch delta for BATCH items. */
  quantity: number;
  /** Signed, grams. 0 for a pure status/location move with no weight change. */
  grossWeight: Grams;
  netWeight: Grams;
  fineWeight: Grams;

  fromStatus?: InventoryStatus;
  toStatus: InventoryStatus;
  /** Null when stock enters the business for the first time (e.g. a fresh purchase). */
  sourceLocationId?: Id;
  /** Null when stock leaves the business for good (e.g. sale, scrap). */
  destinationLocationId?: Id;

  createdAt: Date;
}
