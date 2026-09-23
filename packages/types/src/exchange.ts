import type { Grams, Id, Paise } from "./common";

/**
 * Old jewellery → inspection → weight/purity assessment → valuation → new product → difference
 * payable/refundable. Unlike a `Return`, an exchange's old piece is not necessarily anything the
 * business ever sold — no original order to validate against — so it is staff-only, done at the
 * counter in one sitting, and modelled as its own document rather than reusing `Return`.
 */
export const EXCHANGE_STATUSES = ["DRAFT", "ASSESSED", "COMPLETED", "CANCELLED"] as const;
export type ExchangeStatus = (typeof EXCHANGE_STATUSES)[number];

export const EXCHANGE_SETTLEMENT_METHODS = ["CASH", "CARD", "UPI", "BANK_TRANSFER", "CHEQUE", "STORE_CREDIT"] as const;
export type ExchangeSettlementMethod = (typeof EXCHANGE_SETTLEMENT_METHODS)[number];

export interface ExchangeHistoryEntry {
  status: string;
  at: string;
  by: Id;
  byName?: string;
  note?: string;
}

/**
 * The old piece as inspected: what the customer brought in, weighed and assayed on our own scale —
 * never taken on trust from what they say it is.
 */
export interface OldJewelleryAssessment {
  description: string;
  metalId: Id;
  metalName: string;
  /** What the customer/receipt claims, if anything — purely informational; `assessedPurity` is what we actually decide to pay on. */
  claimedPurity?: string;
  grossWeight: Grams;
  stoneWeight: Grams;
  /** grossWeight - stoneWeight, computed. */
  netWeight: Grams;
  assessedPurity: string;
  assessedFineness: number;
  /** netWeight * assessedFineness. */
  fineWeight: Grams;
  /** What we're crediting per gram of fine metal — from the same rate table everything else prices from, never a one-off number. */
  ratePerGram: Paise;
  /** A deduction for wastage/making-charge write-off on the old piece, if any — making the maths honest when it isn't simply fineWeight × rate. */
  deduction: Paise;
  valuation: Paise;
  notes?: string;
}

export interface ExchangeSettlement {
  /** POSITIVE: the customer owes us this; NEGATIVE: we owe the customer. Never silently clamped to zero. */
  difference: Paise;
  method?: ExchangeSettlementMethod;
  reference?: string;
  note?: string;
  recordedAt: string;
  recordedByName?: string;
}

export interface Exchange {
  id: Id;
  exchangeNo: string;
  status: ExchangeStatus;
  customer: { id?: Id; name: string; phone?: string; email?: string };
  oldJewellery: OldJewelleryAssessment;
  /** Set once the customer has picked what they're taking instead — the new sale itself is a normal Order/B2BSalesOrder, referenced here for the paper trail. */
  newProduct?: { productId: Id; variantId?: Id; sku: string; name: string; quantity: number; unitPrice: Paise; lineTotal: Paise };
  /** The InventoryItem created for the old piece once it's actually taken in (EXCHANGE_IN posted) — not set before that. */
  oldItemId?: Id;
  orderId?: Id;
  orderNo?: string;
  settlement?: ExchangeSettlement;
  notes?: string;
  history: ExchangeHistoryEntry[];
  createdAt: string;
}
