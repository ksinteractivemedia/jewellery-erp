import type { Types } from "mongoose";
import type { BillOfMaterial, JobWorkOrder, ManufacturingHistoryEntry, MaterialItemRef, MaterialReconciliation, ProductionOrder, ReconciliationRow } from "@jewellery/types";
import type { BomAttrs, JobWorkOrderAttrs, MaterialItemRefAttrs, ProductionOrderAttrs, ReconciliationAttrs } from "./manufacturing.models";

const id = (v: unknown) => String(v);
const docId = (d: { _id?: unknown; id?: unknown }) => String(d.id ?? d._id);
export const iso = (d: Date | string) => (typeof d === "string" ? d : d.toISOString());

type WithId<T> = T & { _id: Types.ObjectId; id?: string; createdAt: Date };

const historyView = (h: { status: string; at: Date; by: Types.ObjectId; byName?: string; note?: string }[]): ManufacturingHistoryEntry[] =>
  h.map((e) => ({ status: e.status, at: iso(e.at), by: id(e.by), ...(e.byName ? { byName: e.byName } : {}), ...(e.note ? { note: e.note } : {}) }));

const itemRefView = (refs: MaterialItemRefAttrs[]): MaterialItemRef[] => refs.map((r) => ({ itemId: id(r.itemId), itemCode: r.itemCode, grossWeight: r.grossWeight, ...(r.fromLocationId ? { fromLocationId: id(r.fromLocationId) } : {}) }));

const bomView = (b: BomAttrs): BillOfMaterial => ({
  metalId: id(b.metalId),
  purity: b.purity,
  fineness: b.fineness,
  expectedGrossWeight: b.expectedGrossWeight,
  expectedWastage: b.expectedWastage,
  stonesRequired: b.stonesRequired.map((s) => ({ ...(s.stoneId ? { stoneId: id(s.stoneId) } : {}), name: s.name, caratWeight: s.caratWeight, quantity: s.quantity, ...(s.quality ? { quality: s.quality } : {}), ...(s.certificateNumber ? { certificateNumber: s.certificateNumber } : {}) })),
  ...(b.notes ? { notes: b.notes } : {}),
});

const reconciliationView = (r: ReconciliationAttrs): MaterialReconciliation => ({
  issuedGrossWeight: r.issuedGrossWeight,
  returnedGrossWeight: r.returnedGrossWeight,
  finishedGrossWeight: r.finishedGrossWeight,
  wastageGrossWeight: r.wastageGrossWeight,
  discrepancyGrossWeight: r.discrepancyGrossWeight,
  hasDiscrepancy: r.hasDiscrepancy,
  ...(r.discrepancyNote ? { discrepancyNote: r.discrepancyNote } : {}),
});

export function productionOrderView(d: WithId<ProductionOrderAttrs>): ProductionOrder {
  return {
    id: docId(d),
    productionOrderNo: d.productionOrderNo,
    status: d.status,
    productId: id(d.productId),
    ...(d.variantId ? { variantId: id(d.variantId) } : {}),
    designName: d.designName,
    sku: d.sku,
    quantity: d.quantity,
    bom: bomView(d.bom),
    locationId: id(d.locationId),
    locationName: d.locationName,
    issuedItems: itemRefView(d.issuedItems),
    issuedGrossWeight: d.issuedGrossWeight,
    ...(d.actualGrossWeight !== undefined ? { actualGrossWeight: d.actualGrossWeight } : {}),
    ...(d.actualWastage !== undefined ? { actualWastage: d.actualWastage } : {}),
    ...(d.labourCost !== undefined ? { labourCost: d.labourCost } : {}),
    ...(d.qc ? { qc: { status: d.qc.status, ...(d.qc.notes ? { notes: d.qc.notes } : {}), ...(d.qc.byName ? { byName: d.qc.byName } : {}), at: iso(d.qc.at) } } : {}),
    finishedItems: itemRefView(d.finishedItems),
    returnedItems: itemRefView(d.returnedItems),
    ...(d.reconciliation ? { reconciliation: reconciliationView(d.reconciliation) } : {}),
    history: historyView(d.history),
    createdAt: iso(d.createdAt),
  };
}

export function jobWorkOrderView(d: WithId<JobWorkOrderAttrs>): JobWorkOrder {
  return {
    id: docId(d),
    jobWorkOrderNo: d.jobWorkOrderNo,
    status: d.status,
    vendorId: id(d.vendorId),
    vendorName: d.vendorName,
    ...(d.productId ? { productId: id(d.productId) } : {}),
    ...(d.variantId ? { variantId: id(d.variantId) } : {}),
    ...(d.designName ? { designName: d.designName } : {}),
    issueDate: d.issueDate,
    dueDate: d.dueDate,
    bom: bomView(d.bom),
    makingCharges: d.makingCharges,
    ...(d.expectedOutputDescription ? { expectedOutputDescription: d.expectedOutputDescription } : {}),
    locationId: id(d.locationId),
    locationName: d.locationName,
    ...(d.deliveryAddress ? { deliveryAddress: d.deliveryAddress as JobWorkOrder["deliveryAddress"] } : {}),
    issuedItems: itemRefView(d.issuedItems),
    issuedGrossWeight: d.issuedGrossWeight,
    finishedItems: itemRefView(d.finishedItems),
    returnedItems: itemRefView(d.returnedItems),
    ...(d.reconciliation ? { reconciliation: reconciliationView(d.reconciliation) } : {}),
    history: historyView(d.history),
    createdAt: iso(d.createdAt),
  };
}

export function productionReconciliationRow(d: ProductionOrder): ReconciliationRow | null {
  if (!d.reconciliation && d.issuedGrossWeight <= 0) return null;
  const r = d.reconciliation;
  return {
    kind: "PRODUCTION",
    id: d.id,
    orderNo: d.productionOrderNo,
    status: d.status,
    party: d.designName,
    issuedGrossWeight: d.issuedGrossWeight,
    returnedGrossWeight: r?.returnedGrossWeight ?? 0,
    finishedGrossWeight: r?.finishedGrossWeight ?? 0,
    wastageGrossWeight: r?.wastageGrossWeight ?? 0,
    discrepancyGrossWeight: r?.discrepancyGrossWeight ?? 0,
    hasDiscrepancy: r?.hasDiscrepancy ?? false,
  };
}
export function jobWorkReconciliationRow(d: JobWorkOrder): ReconciliationRow | null {
  if (!d.reconciliation && d.issuedGrossWeight <= 0) return null;
  const r = d.reconciliation;
  return {
    kind: "JOB_WORK",
    id: d.id,
    orderNo: d.jobWorkOrderNo,
    status: d.status,
    party: d.vendorName,
    issuedGrossWeight: d.issuedGrossWeight,
    returnedGrossWeight: r?.returnedGrossWeight ?? 0,
    finishedGrossWeight: r?.finishedGrossWeight ?? 0,
    wastageGrossWeight: r?.wastageGrossWeight ?? 0,
    discrepancyGrossWeight: r?.discrepancyGrossWeight ?? 0,
    hasDiscrepancy: r?.hasDiscrepancy ?? false,
  };
}
