import type { Grams, Id, Timestamps } from "./common";
import type { InventoryStatus } from "./inventory-item";

export type AdjustmentStatus = "PENDING" | "APPROVED" | "REJECTED";

/**
 * A request to correct an item outside the normal movements (found damaged, re-weighed on
 * the scale, restocked after inspection, written off). Nothing changes until someone *other than the
 * requester* holding `inventory.approve_adjustment` approves it; approval posts the ledger entry.
 * `expectedLedgerSeq` pins the item's state at request time — if the item moved in the meantime the
 * approval is refused instead of applying a stale correction.
 */
export interface StockAdjustment extends Timestamps {
  id: Id;
  adjustmentNo: string;
  itemId: Id;
  itemCode: string;
  status: AdjustmentStatus;
  reason: string;
  expectedLedgerSeq: number;
  /** Requested changes — at least one. */
  toStatus?: InventoryStatus;
  /** UNIT items: the re-weighed values (net/fine are re-derived). */
  grossWeight?: Grams;
  stoneWeight?: Grams;
  /** BATCH items: signed deltas. */
  quantityDelta?: number;
  weightDelta?: Grams;
  requestedBy: Id;
  decidedBy?: Id;
  decidedAt?: Date;
  decisionNote?: string;
  /** The ledger transaction that applied it (approved only). */
  transactionId?: Id;
}
