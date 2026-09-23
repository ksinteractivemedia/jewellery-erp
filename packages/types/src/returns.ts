import type { Grams, Id, Paise } from "./common";

/**
 * One return process, for either channel — B2C (against an `Order`) or B2B (against a `B2BSalesOrder`).
 * REQUESTED → APPROVED/REJECTED → RECEIVED (the piece is physically back, ledgered SOLD → RETURNED) →
 * INSPECTED (condition decided per piece, ledgered RETURNED → AVAILABLE/DAMAGED) → SETTLED. Explicit,
 * checked actions only (`returns-status.ts`) — the same discipline as every other workflow module.
 */
export const RETURN_STATUSES = ["REQUESTED", "APPROVED", "REJECTED", "RECEIVED", "INSPECTED", "SETTLED", "CANCELLED"] as const;
export type ReturnStatus = (typeof RETURN_STATUSES)[number];

export const RETURN_CHANNELS = ["B2C", "B2B"] as const;
export type ReturnChannel = (typeof RETURN_CHANNELS)[number];

export const RETURN_REASONS = ["DEFECTIVE", "WRONG_ITEM", "NOT_AS_DESCRIBED", "SIZE_ISSUE", "CHANGED_MIND", "OTHER"] as const;
export type ReturnReason = (typeof RETURN_REASONS)[number];

/** Decided at inspection, per piece — drives which ledger status it lands in (AVAILABLE if GOOD, DAMAGED otherwise). */
export const RETURN_CONDITIONS = ["GOOD", "DAMAGED", "DEFECTIVE"] as const;
export type ReturnCondition = (typeof RETURN_CONDITIONS)[number];

export const RETURN_SETTLEMENT_METHODS = ["REFUND", "STORE_CREDIT", "ADJUST_INVOICE"] as const;
export type ReturnSettlementMethod = (typeof RETURN_SETTLEMENT_METHODS)[number];

export interface ReturnHistoryEntry {
  status: string;
  at: string;
  by: Id;
  byName?: string;
  note?: string;
}

/**
 * One returned piece, tied to the exact `InventoryItem` that was sold — never just "one unit of this
 * SKU". `huid`/`grossWeight` are snapshots of what the order's own item actually is, captured when the
 * return is requested, so the receiving step has something honest to check the physical piece against.
 */
export interface ReturnLine {
  itemId: Id;
  itemCode: string;
  sku: string;
  name: string;
  /** The order's own item id (B2C) or line index (B2B), as a string — which exact line this piece was sold on. */
  orderLineRef: string;
  huid?: string;
  grossWeight: Grams;
  /** What the customer paid for this exact piece (its share of the order line), for the refundable total. */
  unitPrice: Paise;
  /** What the receiving step actually found, if it differs enough from the snapshot to need saying. */
  weightDiscrepancyNote?: string;
  condition?: ReturnCondition;
  conditionNote?: string;
}

export interface ReturnSettlement {
  method: ReturnSettlementMethod;
  amount: Paise;
  reference?: string;
  note?: string;
  recordedAt: string;
  recordedByName?: string;
}

export interface Return {
  id: Id;
  returnNo: string;
  channel: ReturnChannel;
  status: ReturnStatus;
  orderId: Id;
  orderNo: string;
  customer: { id?: Id; name: string; email?: string; phone?: string };
  reason: ReturnReason;
  reasonNote?: string;
  lines: ReturnLine[];
  rejectedReason?: string;
  receivedAt?: string;
  inspectedAt?: string;
  settlement?: ReturnSettlement;
  /** Sum of the lines' unitPrice — informational until SETTLED, when `settlement.amount` is what actually happened. */
  refundableTotal: Paise;
  history: ReturnHistoryEntry[];
  createdAt: string;
  /** Whether the signed-in/guest caller reading this may still cancel it (REQUESTED/APPROVED only, and only their own). */
  canCancel?: boolean;
}
