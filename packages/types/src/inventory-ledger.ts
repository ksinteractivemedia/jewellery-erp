import type { Grams, Id } from "./common";
import type { InventoryStatus } from "./inventory-item";
import type { MovementType } from "./transaction";

/** The item's own totals immediately after an entry — makes any past state readable without replaying deltas. */
export interface LedgerBalance {
  quantity: number;
  grossWeight: Grams;
  stoneWeight: Grams;
  netWeight: Grams;
  fineWeight: Grams;
}

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

  /** 1, 2, 3… per item, gap-free. (itemId, sequence) is unique. */
  sequence: number;

  /** Signed change to the item's quantity: +N on receipt, 0 for a pure status/location move, ±N for a batch or an adjustment. */
  quantity: number;
  /** Signed change in grams. 0 for a pure status/location move. */
  grossWeight: Grams;
  netWeight: Grams;
  fineWeight: Grams;
  /** Where the item's totals stood right after this entry. `balanceAfter` = previous balance + the deltas above. */
  balanceAfter: LedgerBalance;

  fromStatus?: InventoryStatus;
  toStatus: InventoryStatus;
  /** Where the item was before. Absent when stock enters the business for the first time. */
  sourceLocationId?: Id;
  /** Where the item is after this entry — always set, so the item's location at any point is its latest entry's destination. */
  destinationLocationId?: Id;

  createdAt: Date;
}
