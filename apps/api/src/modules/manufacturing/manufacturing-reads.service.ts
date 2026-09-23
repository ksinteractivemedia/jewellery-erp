import type { ReconciliationRow } from "@jewellery/types";
import { jobWorkReconciliationRow, jobWorkOrderView, productionOrderView, productionReconciliationRow } from "./manufacturing-views";
import { JobWorkOrderModel, ProductionOrderModel } from "./manufacturing.models";

/**
 * The reconciliation screen's one read: every production order and job work order that has had
 * material issued, as ISSUED / RETURNED / FINISHED / WASTAGE / DISCREPANCY — so a discrepancy is
 * never buried in two separate document views. Discrepant rows sort first.
 */
export async function reconciliationRows(filter: { hasDiscrepancy?: boolean } = {}): Promise<ReconciliationRow[]> {
  const [productions, jobWorks] = await Promise.all([
    ProductionOrderModel.find({ issuedGrossWeight: { $gt: 0 } }).sort({ createdAt: -1 }).limit(300).lean(),
    JobWorkOrderModel.find({ issuedGrossWeight: { $gt: 0 } }).sort({ createdAt: -1 }).limit(300).lean(),
  ]);
  const rows = [
    ...productions.map((d) => productionReconciliationRow(productionOrderView(d as never))),
    ...jobWorks.map((d) => jobWorkReconciliationRow(jobWorkOrderView(d as never))),
  ].filter((r): r is ReconciliationRow => r !== null);
  const filtered = filter.hasDiscrepancy === undefined ? rows : rows.filter((r) => r.hasDiscrepancy === filter.hasDiscrepancy);
  return filtered.sort((a, b) => (a.hasDiscrepancy === b.hasDiscrepancy ? 0 : a.hasDiscrepancy ? -1 : 1));
}

export interface ManufacturingDashboard {
  counts: { draftProductionOrders: number; inProgress: number; qcPending: number; issuedJobWork: number; discrepancies: number };
}
export async function manufacturingDashboard(): Promise<ManufacturingDashboard> {
  const [draftProductionOrders, inProgress, qcPending, issuedJobWork, rows] = await Promise.all([
    ProductionOrderModel.countDocuments({ status: "DRAFT" }),
    ProductionOrderModel.countDocuments({ status: { $in: ["MATERIAL_ISSUED", "IN_PROGRESS"] } }),
    ProductionOrderModel.countDocuments({ status: "QC_PENDING" }),
    JobWorkOrderModel.countDocuments({ status: { $in: ["ISSUED", "PARTIALLY_RETURNED"] } }),
    reconciliationRows({ hasDiscrepancy: true }),
  ]);
  return { counts: { draftProductionOrders, inProgress, qcPending, issuedJobWork, discrepancies: rows.length } };
}
