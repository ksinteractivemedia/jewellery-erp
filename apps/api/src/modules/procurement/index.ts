/**
 * The purchasing module: requisitions → purchase orders → goods receipts (which post real
 * InventoryLedger entries — see goods-receipt.service.ts) → supplier invoices → supplier payments.
 * Every status change is a named, checked action (procurement-status.ts); nothing outside this
 * module writes a requisition's, purchase order's, invoice's or payment's status.
 */
export * from "./procurement.models";
export * from "./procurement.errors";
export * from "./procurement-status";
export type { Actor } from "./procurement-store";
export { nextNo } from "./procurement-store";
export * from "./procurement-core";

export * as requisitions from "./requisition.service";
export * as purchaseOrders from "./purchase-order.service";
export * as goodsReceipts from "./goods-receipt.service";
export * as supplierInvoices from "./supplier-invoice.service";
export * as supplierPayments from "./supplier-payment.service";
export * as reads from "./procurement-reads.service";
