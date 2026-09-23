/**
 * The hallmarking module: Inventory Item → Send to Hallmarking → In Transit → At Hallmarking Centre →
 * Received → Verified/Failed. Every status change is a named, checked action
 * (hallmarking-status.ts); every physical movement is a real InventoryLedger entry
 * (HALLMARKING_OUT/HALLMARKING_IN — nothing outside this module writes a batch's status or moves its
 * items. Assaying centres are configuration data (assaying-centre.service.ts), never hardcoded.
 */
export * from "./hallmarking.models";
export * from "./hallmarking-status";
export type { Actor } from "./hallmarking-store";
export { nextNo } from "./hallmarking-store";

export * as assayingCentres from "./assaying-centre.service";
export * as batches from "./hallmarking-batch.service";
export * as reads from "./hallmarking-reads.service";
