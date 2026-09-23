/**
 * The returns module (B2C and B2B): REQUESTED → APPROVED/REJECTED → RECEIVED → INSPECTED → SETTLED,
 * or CANCELLED before the piece is physically back. Every status change is a named, checked action
 * (returns-status.ts); every physical movement is a real InventoryLedger entry (the existing RETURN
 * movement type — SOLD → RETURNED at receipt, RETURNED → AVAILABLE/DAMAGED at inspection). A return
 * always ties to the exact InventoryItem an order actually sold (order-context.ts), never just a SKU.
 */
export * from "./returns.models";
export * from "./returns-status";
export type { Actor } from "./returns-store";
export { nextNo } from "./returns-store";
export * from "./order-context";

export * as returns from "./return.service";
export * as reads from "./returns-reads.service";
