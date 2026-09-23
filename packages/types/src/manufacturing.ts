import type { Address, Grams, Id, Paise, StoneDetail } from "./common";

// ---- statuses ---------------------------------------------------------------------------------------
/**
 * Production Order → Material Issue → Manufacturing → QC → Finished Jewellery → Inventory, exactly the
 * flow asked for, as EXPLICIT statuses (manufacturing-status.ts is the one place transitions are named
 * and checked — the same discipline as B2B and Purchasing before it).
 */
export const PRODUCTION_ORDER_STATUSES = ["DRAFT", "MATERIAL_ISSUED", "IN_PROGRESS", "QC_PENDING", "QC_PASSED", "QC_FAILED", "COMPLETED", "CANCELLED"] as const;
export type ProductionOrderStatus = (typeof PRODUCTION_ORDER_STATUSES)[number];

export const JOB_WORK_ORDER_STATUSES = ["DRAFT", "ISSUED", "PARTIALLY_RETURNED", "RETURNED", "CANCELLED"] as const;
export type JobWorkOrderStatus = (typeof JOB_WORK_ORDER_STATUSES)[number];

// ---- shared pieces ------------------------------------------------------------------------------------
/** What the order is meant to consume — fixed at creation, so "how much was issued" always has something to be checked against. */
export interface BillOfMaterial {
  metalId: Id;
  purity: string;
  /** Fineness snapshot at order time, mirroring InventoryItem/PurchaseLine — never rewritten by a later purity-table edit. */
  fineness: number;
  expectedGrossWeight: Grams;
  expectedWastage: Grams;
  stonesRequired: StoneDetail[];
  notes?: string;
}

export interface ManufacturingHistoryEntry {
  status: string;
  at: string;
  by: Id;
  byName?: string;
  note?: string;
}

/** One physical piece issued or returned — a reference to the real InventoryItem, plus what it weighed at the moment, for a record that reads without rejoining the ledger. `fromLocationId` (issued items only) is where it lived before issue — a return goes back there, never into the manufacturing/job-worker location itself (that's not a stock location). */
export interface MaterialItemRef {
  itemId: Id;
  itemCode: string;
  grossWeight: Grams;
  fromLocationId?: Id;
}

/**
 * Weight accounted for: what left the shelf must equal what came back unused, plus what is now
 * embodied in the finished piece(s), plus wastage — or the difference is a discrepancy, which is
 * flagged, never silently absorbed into wastage. The same five figures the reconciliation screen shows.
 */
export interface MaterialReconciliation {
  issuedGrossWeight: Grams;
  returnedGrossWeight: Grams;
  finishedGrossWeight: Grams;
  wastageGrossWeight: Grams;
  discrepancyGrossWeight: Grams;
  hasDiscrepancy: boolean;
  discrepancyNote?: string;
}

// ---- production order (in-house manufacturing) --------------------------------------------------------
export interface ProductionOrder {
  id: Id;
  productionOrderNo: string;
  status: ProductionOrderStatus;
  productId: Id;
  variantId?: Id;
  designName: string;
  sku: string;
  quantity: number;
  bom: BillOfMaterial;
  locationId: Id;
  locationName: string;
  issuedItems: MaterialItemRef[];
  issuedGrossWeight: Grams;
  actualGrossWeight?: Grams;
  actualWastage?: Grams;
  labourCost?: Paise;
  qc?: { status: "PASSED" | "FAILED"; notes?: string; byName?: string; at: string };
  finishedItems: MaterialItemRef[];
  returnedItems: MaterialItemRef[];
  reconciliation?: MaterialReconciliation;
  history: ManufacturingHistoryEntry[];
  createdAt: string;
}

// ---- job work order (outside job worker) -----------------------------------------------------------------
export interface JobWorkOrder {
  id: Id;
  jobWorkOrderNo: string;
  status: JobWorkOrderStatus;
  vendorId: Id;
  vendorName: string;
  productId?: Id;
  variantId?: Id;
  designName?: string;
  issueDate: string;
  dueDate: string;
  bom: BillOfMaterial;
  makingCharges: Paise;
  expectedOutputDescription?: string;
  locationId: Id;
  locationName: string;
  deliveryAddress?: Address;
  issuedItems: MaterialItemRef[];
  issuedGrossWeight: Grams;
  finishedItems: MaterialItemRef[];
  returnedItems: MaterialItemRef[];
  reconciliation?: MaterialReconciliation;
  history: ManufacturingHistoryEntry[];
  createdAt: string;
}

// ---- reconciliation screen ------------------------------------------------------------------------------
export interface ReconciliationRow {
  kind: "PRODUCTION" | "JOB_WORK";
  id: Id;
  orderNo: string;
  status: ProductionOrderStatus | JobWorkOrderStatus;
  party: string;
  issuedGrossWeight: Grams;
  returnedGrossWeight: Grams;
  finishedGrossWeight: Grams;
  wastageGrossWeight: Grams;
  discrepancyGrossWeight: Grams;
  hasDiscrepancy: boolean;
}
