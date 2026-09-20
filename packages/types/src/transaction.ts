import type { Channel, Id } from "./common";

/**
 * Shared by Transaction.type (the business event, coarse) and InventoryLedger.movementType
 * (one line of that event, granular — usually the same value, but e.g. an EXCHANGE
 * transaction produces one RETURN line and one SALE line).
 */
export type MovementType =
  | "PURCHASE"
  | "GOODS_RECEIPT"
  | "SALE"
  | "RETURN"
  | "EXCHANGE"
  | "TRANSFER"
  | "ADJUSTMENT"
  | "MANUFACTURING_ISSUE"
  | "MANUFACTURING_RECEIPT"
  | "JOB_WORK_ISSUE"
  | "JOB_WORK_RECEIPT"
  | "HALLMARKING_OUT"
  | "HALLMARKING_IN"
  | "REPAIR_OUT"
  | "REPAIR_IN"
  | "SCRAP"
  | "MELTING";

export type ReferenceType =
  | "ORDER"
  | "INVOICE"
  | "CUSTOMER_PURCHASE_ORDER"
  | "SUPPLIER_PURCHASE_ORDER"
  | "GOODS_RECEIPT"
  | "PRODUCTION_ORDER"
  | "JOB_WORK_ORDER"
  | "ADJUSTMENT"
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
