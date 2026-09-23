import type { Grams, Id, Paise } from "./common";

/**
 * Customer → repair intake → inspection → estimate → approval → repair → QC → ready → delivery/pickup,
 * as explicit statuses (`repair-status.ts`) — the same discipline as every other workflow module.
 * DECLINED (the customer doesn't approve the estimate) and CANCELLED both end with the piece handed
 * straight back, unrepaired; QC_FAILED loops back to IN_PROGRESS for rework.
 */
export const REPAIR_ORDER_STATUSES = [
  "INTAKE",
  "INSPECTED",
  "ESTIMATED",
  "APPROVED",
  "DECLINED",
  "IN_PROGRESS",
  "QC_PENDING",
  "QC_FAILED",
  "READY",
  "DELIVERED",
  "CANCELLED",
] as const;
export type RepairOrderStatus = (typeof REPAIR_ORDER_STATUSES)[number];

export interface RepairHistoryEntry {
  status: string;
  at: string;
  by: Id;
  byName?: string;
  note?: string;
}

/** A weight snapshot taken at intake and again at completion — the "before weight"/"after weight" the spec names. */
export interface RepairWeightSnapshot {
  grossWeight: Grams;
  stoneWeight: Grams;
  netWeight: Grams;
  at: string;
}

export interface RepairEstimate {
  labourCharge: Paise;
  materialsCharge: Paise;
  otherCharges: Paise;
  total: Paise;
  notes?: string;
  estimatedAt: string;
  estimatedByName?: string;
}

export interface RepairApproval {
  approved: boolean;
  at: string;
  /** Who decided — the customer themself where they have a way to (the portal/storefront), otherwise staff recording a verbal/in-person decision. */
  byName?: string;
  note?: string;
}

export interface RepairQc {
  result: "PASSED" | "FAILED";
  notes?: string;
  at: string;
  byName?: string;
}

export interface RepairOrder {
  id: Id;
  repairNo: string;
  status: RepairOrderStatus;
  customer: { id?: Id; name: string; phone: string; email?: string };
  /** The exact InventoryItem this repair is tracked against — an existing piece of ours, or one created fresh at intake for something we never sold (see InventoryItem.isCustomerOwned). Always set once intake is posted. */
  itemId?: Id;
  itemCode?: string;
  itemDescription: string;
  metalId?: Id;
  purity?: string;
  huid?: string;
  beforeWeight?: RepairWeightSnapshot;
  afterWeight?: RepairWeightSnapshot;
  stoneWork?: string;
  inspectionNotes?: string;
  estimate?: RepairEstimate;
  approval?: RepairApproval;
  /** What was actually charged at completion — starts as the approved estimate, may be adjusted before delivery (never after). */
  finalCharges?: { labourCharge: Paise; materialsCharge: Paise; otherCharges: Paise; total: Paise };
  qc?: RepairQc;
  dueDate?: string;
  readyAt?: string;
  deliveredAt?: string;
  history: RepairHistoryEntry[];
  createdAt: string;
  /** Whether the caller reading this may still cancel it (before IN_PROGRESS). UX only — the API decides for real. */
  canCancel?: boolean;
}
