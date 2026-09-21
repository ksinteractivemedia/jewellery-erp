import type { Id, Paise } from "./common";
import type { PriceBreakdown } from "./pricing";
import type { StoreCartLineInput, StoreImage, StorePrice } from "./storefront";

/**
 * The order lifecycle. DRAFT → PENDING_PAYMENT (stock held) → PAID → CONFIRMED is the checkout; PACKED … RETURNED are fulfilment
 * and aftercare (transition rules: apps/api/src/modules/orders/order-status.ts). A B2C order is never CONFIRMED without money.
 */
export const ORDER_STATUSES = [
  "DRAFT",
  "PENDING_PAYMENT",
  "PAYMENT_FAILED",
  "PAID",
  "CONFIRMED",
  "PACKED",
  "SHIPPED",
  "DELIVERED",
  "CANCELLED",
  "RETURN_REQUESTED",
  "RETURNED",
  "REFUNDED",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** The state of ONE payment attempt. */
export const PAYMENT_STATUSES = ["PENDING", "AUTHORIZED", "CAPTURED", "FAILED", "REFUNDED", "PARTIALLY_REFUNDED"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export type RefundStatus = "PENDING" | "SUCCEEDED" | "FAILED";

/**
 * The price of one order line, frozen at the moment the order was made: every input the engine used and everything it
 * returned. Immutable (append-only in the database) so the order stays financially consistent whatever the metal rate does later.
 */
export interface PriceSnapshot {
  id: Id;
  /** The commercial document this price belongs to (a B2C order, a B2B quotation or sales order). */
  orderId: Id;
  documentType?: "ORDER" | "B2B_QUOTATION" | "B2B_SALES_ORDER";
  productId: Id;
  variantId?: Id;
  sku: string;
  computedAt: string;
  inputs: {
    metalId: Id;
    metalName: string;
    purity: string;
    fineness: number;
    grossWeight: number;
    netWeight: number;
    stoneValue: Paise;
    quotedPurity: string;
    ratePerGram: Paise;
    rateEffectiveFrom: string;
    hsnCode: string;
    taxRuleId?: Id;
    sellerState: string;
    buyerState: string;
    channel: "B2C" | "B2B";
    customerType: "B2C" | "B2B";
    customerId?: Id;
    categoryId?: Id;
  };
  /** The pricing engine's own output for ONE unit. */
  breakdown: PriceBreakdown;
  unitTotal: Paise;
}

// ---- checkout (what the browser sends and is told) ---------------------------------------------

export interface StoreDeliveryOption {
  code: string;
  label: string;
  /** Paise, inclusive of any taxes. */
  fee: Paise;
  estimate?: string;
}

export type CheckoutIssueCode =
  | "UNAVAILABLE"
  | "INSUFFICIENT_STOCK"
  | "SIZE_REQUIRED"
  | "INVALID_SIZE"
  | "PRICE_ON_REQUEST"
  | "DELIVERY_NOT_CHOSEN"
  | "DELIVERY_NOT_OFFERED"
  | "NO_DELIVERY_OPTIONS"
  | "PAYMENTS_NOT_AVAILABLE"
  | "EMPTY_BAG";
export interface CheckoutIssue {
  code: CheckoutIssueCode;
  message: string;
  slug?: string;
  variantSku?: string;
}

export interface StoreCheckoutLine {
  slug: string;
  variantSku?: string;
  name: string;
  image?: StoreImage;
  variantLabel?: string;
  quantity: number;
  /** Pieces that can really be bought right now. */
  available: number;
  unitPrice: StorePrice;
  lineTotal: Paise | null;
}

export interface StoreCheckoutTotals {
  taxableValue: Paise;
  gst: Paise;
  deliveryFee: Paise;
  /** What the customer pays. */
  total: Paise;
}

/**
 * The backend's own recalculation of a bag: what each line costs NOW, what can really be bought, what delivery costs, what
 * is owed. `canPlaceOrder` is true only when there are no issues. Nothing in it comes from the browser except which pieces
 * and how many.
 */
export interface StoreCheckoutVerification {
  lines: StoreCheckoutLine[];
  deliveryOptions: StoreDeliveryOption[];
  delivery?: StoreDeliveryOption;
  totals: StoreCheckoutTotals;
  issues: CheckoutIssue[];
  canPlaceOrder: boolean;
  /** Where GST is charged to, from the address's state — the split (CGST+SGST or IGST) follows it; the total does not. */
  supplyType?: "INTRA_STATE" | "INTER_STATE";
  verifiedAt: string;
}

export interface StoreOrderItem {
  slug: string;
  variantSku?: string;
  sku: string;
  name: string;
  image?: StoreImage;
  variantLabel?: string;
  quantity: number;
  unitPrice: Paise;
  lineTotal: Paise;
  taxableValue: Paise;
  gst: Paise;
  /** What the price was built from, as frozen when the order was placed. */
  pricedWith: { metalName: string; purity: string; netWeight: number; ratePerGram: Paise; rateEffectiveFrom: string; computedAt: string };
}

export interface StoreOrderPayment {
  id: Id;
  status: PaymentStatus;
  amount: Paise;
  refundedAmount: Paise;
  failureReason?: string;
}

/** An order as its customer sees it. No internal ids beyond the order number, no cost, no margin. */
export interface StoreOrder {
  orderNo: string;
  status: OrderStatus;
  placedAt: string;
  /** While the stock is held for the customer: until when. */
  holdExpiresAt?: string;
  customer: { fullName: string; email: string; phone: string };
  shippingAddress: { line1: string; line2?: string; city: string; state: string; postalCode: string };
  delivery: StoreDeliveryOption;
  items: StoreOrderItem[];
  totals: StoreCheckoutTotals;
  supplyType: "INTRA_STATE" | "INTER_STATE";
  payment?: StoreOrderPayment;
  cancelReason?: string;
  /** Whether the customer may pay now / cancel now. */
  canPay: boolean;
  canCancel: boolean;
}

/** What the browser must do to let the customer pay, as told by the payment provider — the order never knows which provider it is. */
export type PaymentAction =
  | { type: "REDIRECT"; url: string }
  | { type: "CLIENT_SDK"; provider: string; payload: Record<string, string> };

export interface StorePaymentStart {
  paymentId: Id;
  provider: string;
  status: PaymentStatus;
  amount: Paise;
  action: PaymentAction;
}

export type { StoreCartLineInput };
