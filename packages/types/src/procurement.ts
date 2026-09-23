import type { Address, Grams, Id, Paise } from "./common";

// ---- purchase types -------------------------------------------------------------------------------
/** What kind of thing a purchase line is buying — drives which fields matter and, on receipt, what kind of stock it becomes. */
export const PURCHASE_TYPES = ["GOLD", "SILVER", "PLATINUM", "STONE", "FINISHED_JEWELLERY", "RAW_MATERIAL", "CONSUMABLE"] as const;
export type PurchaseType = (typeof PURCHASE_TYPES)[number];

/**
 * Weight-tracked types are ordered and received primarily by weight (grams) — a gold purchase is
 * "500 g of 22K", not "500 pieces". Everything else is ordered and received by quantity (a count of
 * pieces or units). This is the one place that distinction is made; the rest of the module reads it.
 */
export const WEIGHT_TRACKED_PURCHASE_TYPES: readonly PurchaseType[] = ["GOLD", "SILVER", "PLATINUM", "RAW_MATERIAL", "STONE"];
export const isWeightTracked = (t: PurchaseType) => WEIGHT_TRACKED_PURCHASE_TYPES.includes(t);
/** A CONSUMABLE (packaging, polishing material, tools...) has no weight/purity/fineness and is never a metal piece — it is not tracked through InventoryItem/InventoryLedger (see procurement-status.ts). */
export const isLedgerTracked = (t: PurchaseType) => t !== "CONSUMABLE";

// ---- statuses ---------------------------------------------------------------------------------------
export const PURCHASE_REQUISITION_STATUSES = ["DRAFT", "SUBMITTED", "APPROVED", "REJECTED", "CONVERTED", "CANCELLED"] as const;
export type PurchaseRequisitionStatus = (typeof PURCHASE_REQUISITION_STATUSES)[number];

export const SUPPLIER_PURCHASE_ORDER_STATUSES = ["DRAFT", "SUBMITTED", "APPROVED", "PARTIALLY_RECEIVED", "RECEIVED", "CANCELLED"] as const;
export type SupplierPurchaseOrderStatus = (typeof SUPPLIER_PURCHASE_ORDER_STATUSES)[number];

export const SUPPLIER_INVOICE_STATUSES = ["UNPAID", "PARTIALLY_PAID", "PAID", "CANCELLED"] as const;
export type SupplierInvoiceStatus = (typeof SUPPLIER_INVOICE_STATUSES)[number];

export const SUPPLIER_PAYMENT_STATUSES = ["RECORDED", "REVERSED"] as const;
export type SupplierPaymentStatus = (typeof SUPPLIER_PAYMENT_STATUSES)[number];

export const SUPPLIER_PAYMENT_METHODS = ["BANK_TRANSFER", "NEFT", "RTGS", "IMPS", "CHEQUE", "CASH", "OTHER"] as const;
export type SupplierPaymentMethod = (typeof SUPPLIER_PAYMENT_METHODS)[number];

// ---- document lines -----------------------------------------------------------------------------------
/**
 * One line of a requisition or purchase order. Amounts are integer paise; `value` is the line's
 * agreed cost before tax — `fineWeight × ratePerGram` for a weight-tracked line (the gold-trade
 * convention: the rate is quoted per gram of *fine* metal, so purity is priced in, not bolted on
 * afterwards), or `ratePerUnit × quantity` otherwise. This is deliberately NOT `packages/pricing-engine`
 * (that engine resolves a SALES price to a customer through the rule hierarchy — CGST/SGST, making
 * charges, wastage, discounts; a purchase line is simply what we agreed to pay one supplier, entered
 * directly, with no rule to resolve).
 */
export interface PurchaseLine {
  purchaseType: PurchaseType;
  description: string;
  productId?: Id;
  variantId?: Id;
  /** Required for a weight-tracked line (business-rules: purity is a defining commercial attribute of a metal purchase). */
  metalId?: Id;
  purity?: string;
  /** Fineness snapshot at order time, mirroring InventoryItem — so a later purity-table edit never rewrites a past order. */
  fineness?: number;
  /** Pieces/units ordered. For a weight-tracked line this is informational (usually 1 lot); grossWeight is what governs receipt. */
  quantity: number;
  /** Total ordered weight, grams — required and authoritative for a weight-tracked line. */
  grossWeight?: Grams;
  ratePerGram?: Paise;
  ratePerUnit?: Paise;
  value: Paise;
  lotNumber?: string;
  notes?: string;
  /** Cumulative across every posted goods receipt against this line — kept on the PO line so "how much is left" never needs recomputation from history. */
  receivedQuantity: number;
  receivedGrossWeight: Grams;
}

export const purchaseLineIsClosed = (l: Pick<PurchaseLine, "purchaseType" | "quantity" | "grossWeight" | "receivedQuantity" | "receivedGrossWeight">) =>
  isWeightTracked(l.purchaseType) ? l.receivedGrossWeight >= (l.grossWeight ?? 0) : l.receivedQuantity >= l.quantity;

export interface PurchaseTotals {
  subtotal: Paise;
  taxAmount: Paise;
  total: Paise;
}

export interface PurchaseHistoryEntry {
  status: string;
  at: string;
  by: Id;
  byName?: string;
  note?: string;
}

// ---- purchase requisition -----------------------------------------------------------------------------
/** An internal ask, raised before a supplier is even chosen for some lines. Converting it creates a PurchaseOrder from its lines. */
export interface PurchaseRequisition {
  id: Id;
  prNo: string;
  status: PurchaseRequisitionStatus;
  requestedBy: { id: Id; name: string };
  department?: string;
  reason: string;
  lines: PurchaseLine[];
  totals: PurchaseTotals;
  purchaseOrderId?: Id;
  rejectedReason?: string;
  history: PurchaseHistoryEntry[];
  createdAt: string;
}

// ---- purchase order -------------------------------------------------------------------------------------
export interface PurchaseOrder {
  id: Id;
  poNo: string;
  status: SupplierPurchaseOrderStatus;
  supplier: { id: Id; name: string; gstin?: string };
  requisitionId?: Id;
  lines: PurchaseLine[];
  totals: PurchaseTotals;
  deliveryLocation: { id: Id; name: string };
  billingAddress?: Address;
  expectedDeliveryDate?: string;
  notes?: string;
  approvedAt?: string;
  approvedByName?: string;
  rejectedReason?: string;
  cancelledReason?: string;
  goodsReceiptIds: Id[];
  supplierInvoiceIds: Id[];
  history: PurchaseHistoryEntry[];
  createdAt: string;
}

// ---- goods receipt --------------------------------------------------------------------------------------
export interface GoodsReceiptLine {
  purchaseOrderLineIndex: number;
  purchaseType: PurchaseType;
  description: string;
  metalId?: Id;
  /** As actually received — checked against the PO line's purity; a mismatch is refused (see procurement business rules). */
  purity?: string;
  fineness?: number;
  quantity: number;
  grossWeight?: Grams;
  /** What the delivery note/lot said to expect for THIS shipment — separate from the ordered total, since one line can arrive in several deliveries. Comparing the scale reading against it is what "weight discrepancy" means; omitted, no comparison is made. */
  expectedGrossWeight?: Grams;
  /** Grams of fine metal actually received — derived, never accepted as input (weight-calculations.ts's own rule, mirrored here). */
  fineWeight?: Grams;
  ratePerGram?: Paise;
  ratePerUnit?: Paise;
  value: Paise;
  lotNumber?: string;
  locationId: Id;
  /** Set when the scale reading differs from the declared `expectedGrossWeight` by more than the tolerance — flagged, not blocked. */
  hasWeightDiscrepancy: boolean;
  variancePercent?: number;
  discrepancyNote?: string;
  /** The InventoryItem(s) this line created — empty for a CONSUMABLE line, which is not ledger-tracked. */
  inventoryItemIds: Id[];
}

export interface GoodsReceipt {
  id: Id;
  grnNo: string;
  purchaseOrderId: Id;
  poNo: string;
  supplier: { id: Id; name: string };
  receivedDate: string;
  lines: GoodsReceiptLine[];
  notes?: string;
  receivedByName?: string;
  createdAt: string;
}

// ---- supplier invoice -------------------------------------------------------------------------------------
/** A billed line — the same shape as a purchase line minus the receipt-progress fields, which don't apply to an invoice. */
export type SupplierInvoiceLine = Omit<PurchaseLine, "receivedQuantity" | "receivedGrossWeight">;

export interface SupplierInvoice {
  id: Id;
  /** The supplier's OWN invoice number — free text, not our sequence, since it is literally the paper bill they issued. */
  supplierInvoiceNo: string;
  status: SupplierInvoiceStatus;
  supplier: { id: Id; name: string; gstin?: string };
  purchaseOrderId?: Id;
  poNo?: string;
  goodsReceiptIds: Id[];
  invoiceDate: string;
  dueDate: string;
  lines: SupplierInvoiceLine[];
  totals: PurchaseTotals;
  /** Derived from unreversed allocations — never stored/settable directly (same rule as B2B's invoices). */
  paid: Paise;
  balance: Paise;
  cancelledReason?: string;
  history: PurchaseHistoryEntry[];
  createdAt: string;
}

// ---- supplier payment --------------------------------------------------------------------------------------
export interface SupplierPaymentAllocationView {
  paymentId: Id;
  paymentNo: string;
  supplierInvoiceId: Id;
  supplierInvoiceNo: string;
  amount: Paise;
  at: string;
}

export interface SupplierPayment {
  id: Id;
  paymentNo: string;
  status: SupplierPaymentStatus;
  supplier: { id: Id; name: string };
  method: SupplierPaymentMethod;
  amount: Paise;
  unallocated: Paise;
  paidDate: string;
  reference?: string;
  bankName?: string;
  notes?: string;
  recordedByName?: string;
  reversedReason?: string;
  allocations: SupplierPaymentAllocationView[];
  createdAt: string;
}

// ---- supplier outstanding (payables) --------------------------------------------------------------------------
export interface SupplierAgeing {
  current: Paise;
  days1to30: Paise;
  days31to60: Paise;
  days61to90: Paise;
  over90: Paise;
}
export interface SupplierOutstanding {
  supplier: { id: Id; name: string };
  totalOwed: Paise;
  overdue: Paise;
  ageing: SupplierAgeing;
  invoices: { id: Id; supplierInvoiceNo: string; dueDate: string; total: Paise; balance: Paise; daysOverdue: number; status: SupplierInvoiceStatus }[];
}

export interface PurchaseDashboard {
  counts: {
    openRequisitions: number;
    openPurchaseOrders: number;
    pendingReceipt: number;
    unpaidInvoices: number;
    overdueInvoices: number;
  };
  payables: { totalOwed: Paise; overdue: Paise };
  recentPurchaseOrders: PurchaseOrder[];
  recentGoodsReceipts: GoodsReceipt[];
}
