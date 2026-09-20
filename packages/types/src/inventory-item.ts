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
  | "MELTING";

export interface ManufacturingInfo {
  productionOrderId?: Id;
  jobWorkOrderId?: Id;
  manufacturedDate?: Date;
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

  manufacturingInfo?: ManufacturingInfo;
}
