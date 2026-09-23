/**
 * The jewellery repair module: Customer → repair intake → inspection → estimate → approval →
 * repair → QC → ready → delivery/pickup. Every status change is a named, checked action
 * (repair-status.ts); every physical movement is a real InventoryLedger entry — intake moves the
 * piece into custody (REPAIR_OUT for a piece already ours, REPAIR_INTAKE creating one fresh for a
 * customer-owned piece we've never held), and leaving custody (declined, delivered, or cancelled)
 * is always REPAIR_RETURN, never back into sellable AVAILABLE stock.
 */
export * from "./repair.models";
export * from "./repair-status";
export type { Actor } from "./repair-store";
export { nextNo } from "./repair-store";

export * as repairs from "./repair-order.service";
export * as reads from "./repair-reads.service";
