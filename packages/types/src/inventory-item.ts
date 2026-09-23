import type { Grams, Id, Paise, StoneDetail, Timestamps } from "./common";

export type InventoryItemKind = "FINISHED_JEWELLERY" | "RAW_MATERIAL" | "SEMI_FINISHED" | "LOOSE_STONE";
export type Serialization = "UNIT" | "BATCH";
export type HallmarkStatus = "NOT_APPLICABLE" | "PENDING" | "HALLMARKED";

export type InventoryStatus =
  | "AVAILABLE"
  | "RESERVED"
  | "SOLD"
  | "RETURNED"
  | "DAMAGED"
  | "UNDER_REPAIR"
  | "IN_MANUFACTURING"
  | "WITH_JOB_WORKER"
  | "IN_TRANSIT"
  | "HALLMARKING"
  | "SCRAP"
  | "MELTING"
  /** Terminal: a piece handed back to a customer at the end of a repair, that was never ours to sell (see `isCustomerOwned`). Not a sale, not stock — just the record that it left our custody. */
  | "RETURNED_TO_CUSTOMER";

export interface ManufacturingInfo {
  productionOrderId?: Id;
  jobWorkOrderId?: Id;
  manufacturedDate?: Date;
}

/**
 * Why an item is RESERVED and for whom. Set and cleared only by RESERVATION / RELEASE_RESERVATION /
 * SALE ledger entries — so "reserved for order X" can always be traced to the entry that did it.
 */
export interface ItemReservation {
  referenceType: "ORDER" | "CUSTOMER_PURCHASE_ORDER" | "MANUAL";
  referenceId: Id;
  reservedAt: Date;
  reservedBy: Id;
  /** After this moment the hold may be released by the expiry sweep (checkout abandoned). */
  expiresAt?: Date;
}

/**
 * One physical piece (UNIT) or one fungible batch (BATCH — raw material, loose stones
 * before allocation). Never just a quantity — see architecture.md §4 and business-rules.md §2.2.
 *
 * status/locationId are derived caches: they may only change as the side effect of posting
 * an InventoryLedger entry (business-rules.md §2.1). Nothing outside the inventory
 * transaction service may write them directly.
 */
export interface InventoryItem extends Timestamps {
  id: Id;
  itemCode: string;
  barcode?: string;
  serialNumber?: string;
  productId?: Id;
  variantId?: Id;
  type: InventoryItemKind;
  serialization: Serialization;

  grossWeight: Grams;
  stoneWeight: Grams;
  /** grossWeight - stoneWeight, computed — never set directly. See weight-calculations.ts. */
  netWeight: Grams;
  /** netWeight * fineness, computed — never set directly. */
  fineWeight: Grams;

  metalId: Id;
  purity: string;
  /** Fineness snapshot at creation time, so a later change to Metal.purityOptions never rewrites history. */
  fineness: number;

  huid?: string;
  hallmarkStatus: HallmarkStatus;
  stoneDetails: StoneDetail[];

  locationId: Id;
  status: InventoryStatus;

  /** Landed/manufacturing cost, paise — never exposed to customers. */
  cost: Paise;
  /** 1 for UNIT items; the batch quantity for BATCH items. */
  quantity: number;

  reservation?: ItemReservation;
  /**
   * Count of ledger entries posted for this item. Every movement increments it atomically and
   * stamps the same number on its ledger entry, so two writers racing on one item cannot both
   * win, and the ledger has a gap-free per-item order that never depends on clock ties.
   */
  ledgerSeq: number;

  manufacturingInfo?: ManufacturingInfo;

  /**
   * True only for a piece created by a repair intake for something the business never sold and
   * does not own (brought in from elsewhere, or from before this system existed) — tracked through
   * the ledger like any other piece while it's in our custody, but it can never become `AVAILABLE`
   * stock and its `cost` is 0. Absent/false for everything else, including our own stock sent out
   * for repair.
   */
  isCustomerOwned?: boolean;
}
