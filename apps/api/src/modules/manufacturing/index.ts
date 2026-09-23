/**
 * The manufacturing module: production orders (Production Order → Material Issue → Manufacturing →
 * QC → Finished Jewellery → Inventory) and job work (issue to a vendor → return: finished goods,
 * unused material, wastage, discrepancy). Every status change is a named, checked action
 * (manufacturing-status.ts); every physical stock movement is a real InventoryLedger entry — nothing
 * outside this module writes a production/job-work order's status or moves its material.
 */
export * from "./manufacturing.models";
export * from "./manufacturing-status";
export type { Actor } from "./manufacturing-store";
export { nextNo } from "./manufacturing-store";
export * from "./manufacturing-core";

export * as productionOrders from "./production-order.service";
export * as jobWorkOrders from "./job-work-order.service";
export * as reads from "./manufacturing-reads.service";
