import type { InventoryStatus } from "@jewellery/types";
import { IllegalTransitionError } from "../../shared/errors";

/**
 * The legal status graph for InventoryItem (business-rules.md §2.5). Anything not listed
 * here is illegal — e.g. `SOLD -> AVAILABLE` is not a transition at all; a sale is undone
 * with an explicit RETURN (`SOLD -> RETURNED`), never by jumping back to `AVAILABLE`.
 * `MELTING` is terminal: melted metal re-enters stock as a *new* InventoryItem via a
 * PURCHASE/GOODS_RECEIPT, not a further transition of the same item.
 */
export const LEGAL_TRANSITIONS: Record<InventoryStatus, InventoryStatus[]> = {
  AVAILABLE: ["RESERVED", "SOLD", "IN_MANUFACTURING", "WITH_JOB_WORKER", "IN_TRANSIT", "HALLMARKING", "UNDER_REPAIR", "DAMAGED", "SCRAP", "MELTING"],
  RESERVED: ["AVAILABLE", "SOLD"],
  // A customer may also bring a sold piece back in for servicing (REPAIR_OUT) without it being a formal RETURN.
  SOLD: ["RETURNED", "UNDER_REPAIR"],
  RETURNED: ["AVAILABLE", "DAMAGED", "SCRAP"],
  DAMAGED: ["UNDER_REPAIR", "SCRAP", "MELTING"],
  // AVAILABLE/DAMAGED (pre-sale repair, REPAIR_IN) — SOLD/RETURNED_TO_CUSTOMER (a repaired piece handed back to its owner, REPAIR_RETURN, never our stock).
  UNDER_REPAIR: ["AVAILABLE", "DAMAGED", "SCRAP", "SOLD", "RETURNED_TO_CUSTOMER"],
  IN_MANUFACTURING: ["AVAILABLE", "SCRAP", "MELTING"],
  WITH_JOB_WORKER: ["AVAILABLE", "DAMAGED"],
  IN_TRANSIT: ["AVAILABLE", "DAMAGED"],
  HALLMARKING: ["AVAILABLE"],
  SCRAP: ["MELTING"],
  MELTING: [],
  /** Terminal: the piece is gone, back with whoever owns it. */
  RETURNED_TO_CUSTOMER: [],
};

export function isLegalTransition(from: InventoryStatus, to: InventoryStatus): boolean {
  return LEGAL_TRANSITIONS[from]?.includes(to) ?? false;
}

/** Throws IllegalTransitionError if the move isn't allowed — the enforcement point every write path calls. */
export function assertLegalTransition(from: InventoryStatus, to: InventoryStatus): void {
  if (!isLegalTransition(from, to)) {
    throw new IllegalTransitionError(from, to);
  }
}
