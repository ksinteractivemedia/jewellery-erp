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
  SOLD: ["RETURNED"],
  RETURNED: ["AVAILABLE", "DAMAGED", "SCRAP"],
  DAMAGED: ["UNDER_REPAIR", "SCRAP", "MELTING"],
  UNDER_REPAIR: ["AVAILABLE", "DAMAGED", "SCRAP"],
  IN_MANUFACTURING: ["AVAILABLE", "SCRAP", "MELTING"],
  WITH_JOB_WORKER: ["AVAILABLE", "DAMAGED"],
  IN_TRANSIT: ["AVAILABLE", "DAMAGED"],
  HALLMARKING: ["AVAILABLE"],
  SCRAP: ["MELTING"],
  MELTING: [],
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
