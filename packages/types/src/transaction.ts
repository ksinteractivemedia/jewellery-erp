import type { Channel, Id } from "./common";

/**
 * Shared by Transaction.type (the business event) and InventoryLedger.movementType (one line
 * of that event). A multi-line event (a transfer of ten pieces) is one Transaction with ten lines.
 */
export type MovementType =
  | "PURCHASE_RECEIPT"
  | "SALE"
  | "RETURN"
  | "TRANSFER_OUT"
  | "TRANSFER_IN"
  | "RESERVATION"
  | "RELEASE_RESERVATION"
  | "MANUFACTURING_ISSUE"
  | "MANUFACTURING_RECEIPT"
  | "JOBWORK_ISSUE"
  | "JOBWORK_RECEIPT"
  | "REPAIR_OUT"
  | "REPAIR_IN"
  | "HALLMARKING_OUT"
  | "HALLMARKING_IN"
  | "ADJUSTMENT"
  | "SCRAP"
  /** Not in the original brief but required: MELTING is a status with no other way to reach it. */
  | "MELTING"
  /** Old jewellery taken in on an exchange becomes ours (RAW_MATERIAL, pending appraisal/melt) — a creation movement like PURCHASE_RECEIPT, but sourced from a customer trade-in, not a supplier. */
  | "EXCHANGE_IN"
  /** Repair intake for a piece that isn't already an InventoryItem (see `isCustomerOwned`) — creates it directly into UNDER_REPAIR, since it was never AVAILABLE stock to begin with. */
  | "REPAIR_INTAKE"
  /** Hands a repaired piece back to whoever owns it: our own previously-sold piece returns to SOLD (still theirs, just serviced); a customer-owned piece created by REPAIR_INTAKE ends at RETURNED_TO_CUSTOMER. Deliberately separate from REPAIR_IN, which puts OUR pre-sale stock back on the shelf (AVAILABLE) — a customer's repaired piece must never land there. */
  | "REPAIR_RETURN";

export type ReferenceType =
  | "ORDER"
  | "INVOICE"
  | "CUSTOMER_PURCHASE_ORDER"
  | "SUPPLIER_PURCHASE_ORDER"
  | "GOODS_RECEIPT"
  | "PRODUCTION_ORDER"
  | "JOB_WORK_ORDER"
  | "STOCK_TRANSFER"
  | "ADJUSTMENT"
  | "RETURN"
  | "EXCHANGE"
  | "REPAIR_ORDER"
  | "MANUAL";

/**
 * The business event that produced one or more InventoryLedger entries. Immutable once
 * created — never updated or deleted (business-rules.md §2.1, §6.3). No `updatedAt`
 * on purpose: a document that's never updated shouldn't imply it might be.
 */
export interface Transaction {
  id: Id;
  type: MovementType;
  channel: Channel;
  referenceType: ReferenceType;
  referenceId?: Id;
  performedBy: Id;
  reason?: string;
  createdAt: Date;
}
