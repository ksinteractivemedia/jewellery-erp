import type { Address, Id, Paise } from "./common";

// ---- customer profile ---------------------------------------------------------------------------
export interface B2BContact {
  name: string;
  email?: string;
  phone?: string;
  designation?: string;
  isPrimary: boolean;
}

/**
 * What makes a customer a wholesale account: credit terms, price list, who looks after them. Outstanding and overdue are
 * deliberately NOT here — they are derived from invoices and payment allocations every time they are read (business-rules.md §4.3).
 */
export interface B2BProfile {
  contacts: B2BContact[];
  creditLimit: Paise;
  paymentTermsDays: number;
  /** Stable price-list code; the version in force is resolved at pricing time. */
  priceListCode?: string;
  salespersonId?: Id;
  territory?: string;
  /** Stops new orders being approved without an explicit credit override. */
  creditHold: boolean;
  /** When true, any overdue invoice also requires an override. */
  blockOnOverdue: boolean;
}

// ---- statuses -----------------------------------------------------------------------------------
export const PURCHASE_ORDER_STATUSES = ["DRAFT", "SUBMITTED", "UNDER_REVIEW", "QUOTED", "NEGOTIATION", "APPROVED", "REJECTED", "EXPIRED", "CONVERTED", "CANCELLED"] as const;
export type PurchaseOrderStatus = (typeof PURCHASE_ORDER_STATUSES)[number];

export const QUOTATION_STATUSES = ["DRAFT", "QUOTED", "NEGOTIATION", "APPROVED", "REJECTED", "EXPIRED", "CONVERTED", "SUPERSEDED"] as const;
export type QuotationStatus = (typeof QUOTATION_STATUSES)[number];

export const SALES_ORDER_STATUSES = ["DRAFT", "CONFIRMED", "PARTIALLY_ALLOCATED", "ALLOCATED", "PARTIALLY_FULFILLED", "FULFILLED", "CANCELLED"] as const;
export type SalesOrderStatus = (typeof SALES_ORDER_STATUSES)[number];

export const B2B_PAYMENT_METHODS = ["BANK_TRANSFER", "NEFT", "RTGS", "IMPS", "CHEQUE", "CASH", "OTHER"] as const;
export type B2BPaymentMethod = (typeof B2B_PAYMENT_METHODS)[number];

/** A payment is a RECORD until someone other than its author confirms the money arrived; only then can it settle an invoice. */
export const B2B_PAYMENT_STATUSES = ["PENDING_VERIFICATION", "VERIFIED", "REJECTED", "REVERSED"] as const;
export type B2BPaymentStatus = (typeof B2B_PAYMENT_STATUSES)[number];

export type InvoicePaymentStatus = "UNPAID" | "PARTIALLY_PAID" | "PAID" | "OVERDUE" | "CANCELLED";

// ---- pricing ------------------------------------------------------------------------------------
/** Which layer of the price hierarchy decided the making charge — so a wholesaler can see WHY their price is what it is. */
export type PriceBasis = "CUSTOMER" | "CUSTOMER_GROUP" | "PRICE_LIST" | "CATEGORY" | "DEFAULT";
export type B2BPriceUnavailableReason = "POLICY" | "NO_WEIGHT" | "STONE_VALUE_MISSING" | "NO_METAL_RATE" | "PRICING_NOT_CONFIGURED";

export type B2BPrice =
  | { status: "AVAILABLE"; unitMaking: Paise; unitDiscount: Paise; unitTaxable: Paise; unitGst: Paise; unitTotal: Paise; basis: PriceBasis; basisName?: string; ratePerGram: Paise; computedAt: string }
  | { status: "ON_REQUEST"; reason: B2BPriceUnavailableReason; message: string };

// ---- document lines ------------------------------------------------------------------------------
/** One line of a PO, quotation, sales order or invoice. Amounts are per unit and per line (× quantity), all integer paise. */
export interface B2BLine {
  productId: Id;
  variantId?: Id;
  sku: string;
  name: string;
  variantLabel?: string;
  quantity: number;
  /** True when this line has no price yet (price on request): the amounts below are 0 and the seller must quote it. */
  priceOnRequest?: boolean;
  /** Per unit, all integer paise. Taxable = metal + wastage + making + stones − discount; total = taxable + GST. */
  unitMaking: Paise;
  unitDiscount: Paise;
  unitTaxable: Paise;
  unitGst: Paise;
  unitTotal: Paise;
  lineMaking: Paise;
  lineDiscount: Paise;
  lineTaxable: Paise;
  lineGst: Paise;
  lineTotal: Paise;
  basis?: PriceBasis;
  /** A negotiated concession, as the seller entered it. Everything else on the line is the pricing engine's. */
  concession?: { kind: "PERCENT" | "TARGET_PRICE"; value: number; note?: string; /** The standard (list) unit price before the concession, before GST. */ listUnitTaxable?: Paise };
  /** The frozen price behind this line, once it is a commercial commitment (quotation onwards). */
  priceSnapshotId?: Id;
}

export interface B2BTotals {
  taxable: Paise;
  gst: Paise;
  total: Paise;
  /** False when a line is price-on-request, so the total is not the whole amount. */
  complete: boolean;
}
export interface B2BTaxSplit {
  supplyType: "INTRA_STATE" | "INTER_STATE";
  cgst: Paise;
  sgst: Paise;
  igst: Paise;
}

// ---- credit -------------------------------------------------------------------------------------
export interface CreditPosition {
  limit: Paise;
  /** Unpaid invoice balances. */
  outstanding: Paise;
  /** Approved orders not yet invoiced — money already promised against the limit. */
  committed: Paise;
  /** limit − outstanding − committed; negative means over the limit. */
  available: Paise;
  /** The part of outstanding that is past its due date. */
  overdue: Paise;
  onHold: boolean;
  blockOnOverdue: boolean;
}
export type CreditReasonCode = "CREDIT_LIMIT_EXCEEDED" | "ACCOUNT_ON_HOLD" | "OVERDUE_INVOICES";
export interface CreditReason {
  code: CreditReasonCode;
  message: string;
  /** What the customer (or seller) can do about it. */
  action: string;
}
export interface CreditCheck {
  position: CreditPosition;
  orderAmount: Paise;
  exposureAfter: Paise;
  wouldExceedBy: Paise;
  reasons: CreditReason[];
  /** True when the order cannot be approved without a credit override. */
  requiresApproval: boolean;
}

// ---- documents (the same shape for the customer and for the seller) -----------------------------
export interface B2BHistoryEntry {
  status: string;
  at: string;
  by: "CUSTOMER" | "SELLER" | "SYSTEM";
  actorName?: string;
  note?: string;
}

export interface B2BAttachment {
  id: Id;
  name: string;
  mimeType: string;
  size: number;
  uploadedAt: string;
  uploadedBy: "CUSTOMER" | "SELLER";
  uploadedByName?: string;
}

export interface B2BPurchaseOrder {
  id: Id;
  poNo: string;
  customerPoRef?: string;
  customer: { id: Id; name: string };
  status: PurchaseOrderStatus;
  lines: B2BLine[];
  totals: B2BTotals;
  shippingAddress: Address;
  billingAddress: Address;
  notes?: string;
  requestedDeliveryDate?: string;
  attachments: B2BAttachment[];
  /** What was agreed (prices, making charges, discount, tax, total) — set when the PO is approved, and what the sales order is made from. */
  approved?: { lines: B2BLine[]; totals: B2BTotals; approvedAt: string; approvedByName?: string; via: "QUOTATION" | "DIRECT" };
  /** The credit position when it was submitted, so the customer sees the same warning the seller does. */
  credit?: CreditCheck;
  quotationId?: Id;
  salesOrderId?: Id;
  submittedAt?: string;
  history: B2BHistoryEntry[];
  createdAt: string;
}

export interface B2BQuotationMessage {
  by: "CUSTOMER" | "SELLER";
  at: string;
  text: string;
  requestedPrices?: { sku: string; unitTaxable: Paise }[];
}
export interface B2BQuotation {
  id: Id;
  quoteNo: string;
  version: number;
  purchaseOrderId: Id;
  poNo: string;
  customer: { id: Id; name: string };
  status: QuotationStatus;
  lines: B2BLine[];
  totals: B2BTotals;
  validUntil: string;
  terms?: string;
  messages: B2BQuotationMessage[];
  issuedAt: string;
}

export interface B2BSalesOrder {
  id: Id;
  soNo: string;
  purchaseOrderId: Id;
  poNo: string;
  customerPoRef?: string;
  quotationId?: Id;
  customer: { id: Id; name: string };
  status: SalesOrderStatus;
  lines: B2BLine[];
  /** Per line: how many pieces are held for it, and how many have been invoiced (sold). */
  progress: { sku: string; quantity: number; allocated: number; invoiced: number }[];
  totals: B2BTotals;
  shippingAddress: Address;
  billingAddress: Address;
  credit: { check: CreditCheck; override?: { reason: string; at: string; byName?: string } };
  shortfall?: { sku: string; name: string; wanted: number; available: number }[];
  allocatedAt?: string;
  invoices: { id: Id; invoiceNo: string; total: Paise }[];
  history: B2BHistoryEntry[];
  createdAt: string;
}

export interface B2BAllocationView {
  paymentId: Id;
  paymentNo: string;
  invoiceId: Id;
  invoiceNo: string;
  amount: Paise;
  at: string;
  method: B2BPaymentMethod;
  reference?: string;
}
export interface B2BInvoice {
  id: Id;
  invoiceNo: string;
  /** 1 for a sales order's first invoice, 2 for its second, and so on — a sales order can be invoiced across several. */
  sequence: number;
  salesOrderId: Id;
  soNo: string;
  customer: { id: Id; name: string; gstin?: string };
  issueDate: string;
  dueDate: string;
  lines: B2BLine[];
  totals: B2BTotals;
  taxes: B2BTaxSplit;
  shippingAddress: Address;
  billingAddress: Address;
  /** Derived from verified, unreversed allocations — never stored. */
  paid: Paise;
  balance: Paise;
  status: InvoicePaymentStatus;
  daysOverdue: number;
  allocations: B2BAllocationView[];
}

export interface B2BPayment {
  id: Id;
  paymentNo: string;
  customer: { id: Id; name: string };
  method: B2BPaymentMethod;
  amount: Paise;
  receivedDate: string;
  reference?: string;
  bankName?: string;
  notes?: string;
  source: "CUSTOMER" | "STAFF";
  status: B2BPaymentStatus;
  recordedByName?: string;
  verifiedByName?: string;
  verifiedAt?: string;
  rejectedReason?: string;
  /** What has been applied to invoices / what is still available to apply (verified payments only). */
  allocated: Paise;
  unallocated: Paise;
  allocations: B2BAllocationView[];
  createdAt: string;
}

export interface AgeingBuckets {
  current: Paise;
  days1to30: Paise;
  days31to60: Paise;
  days61to90: Paise;
  over90: Paise;
}
export interface B2BOutstanding {
  position: CreditPosition;
  ageing: AgeingBuckets;
  invoices: B2BInvoice[];
  /** Verified money received but not yet applied to an invoice. */
  unappliedPayments: Paise;
  pendingPayments: Paise;
}

// ---- customer-facing account & catalogue --------------------------------------------------------
export interface B2BAccount {
  customer: { id: Id; name: string; gstin?: string; email?: string; phone?: string };
  billingAddress?: Address;
  shippingAddresses: Address[];
  profile: Omit<B2BProfile, "salespersonId">;
  priceList?: { code: string; name: string };
  groupName?: string;
  salesperson?: { name: string; email?: string; phone?: string };
  position: CreditPosition;
}

export interface B2BCatalogueItem {
  productId: Id;
  variantId?: Id;
  sku: string;
  name: string;
  variantLabel?: string;
  category?: string;
  metal?: string;
  purity?: string;
  grossWeight?: number;
  netWeight?: number;
  hasStones: boolean;
  image?: string;
  price: B2BPrice;
  /** Exact pieces available to this customer right now. */
  available: number;
  minOrderQuantity: number;
}
export interface B2BCatalogueResult {
  items: B2BCatalogueItem[];
  total: number;
  page: number;
  pageSize: number;
  facets: { categories: { name: string; slug: string; count: number }[]; metals: { code: string; name: string; count: number }[]; purities: { code: string; count: number }[] };
}

export type LineProblemCode = "UNKNOWN_SKU" | "NOT_OFFERED" | "BELOW_MOQ" | "INSUFFICIENT_STOCK" | "OUT_OF_STOCK" | "PRICE_ON_REQUEST";
export interface B2BResolvedLine {
  sku: string;
  quantity: number;
  item?: B2BCatalogueItem;
  lineTaxable: Paise | null;
  lineGst: Paise | null;
  lineTotal: Paise | null;
  /** Problems stop an order (UNKNOWN_SKU, NOT_OFFERED, BELOW_MOQ); warnings only inform (stock, price on request). */
  problems: { code: LineProblemCode; message: string; blocking: boolean }[];
}
export interface B2BCartQuote {
  lines: B2BResolvedLine[];
  totals: B2BTotals;
  credit: CreditCheck;
  canSubmit: boolean;
  quotedAt: string;
}

export interface B2BDashboard {
  account: B2BAccount;
  counts: { openPurchaseOrders: number; quotationsAwaitingYou: number; ordersInProgress: number; unpaidInvoices: number; overdueInvoices: number; paymentsPending: number };
  actions: { kind: "QUOTATION" | "OVERDUE" | "CREDIT" | "PAYMENT"; message: string; href: string }[];
  recentOrders: B2BSalesOrder[];
  dueSoon: B2BInvoice[];
}
