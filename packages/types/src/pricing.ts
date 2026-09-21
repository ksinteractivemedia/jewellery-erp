import type { Channel, CustomerType, Grams, Id, Paise } from "./common";
import type { Discount, MakingTerms, PricingRule, WastageTerms } from "./pricing-rule";
import type { TaxTerms } from "./tax-rule";

/**
 * The pricing engine's contract (packages/pricing-engine). It lives here, not in the engine, so the
 * ERP and the future storefronts can type what the API returns without depending on the engine —
 * which keeps price math out of the frontends (architecture.md §5).
 *
 * Units: every money field is integer paise; every weight is grams with at most 3 decimals.
 */

export interface PurityRef {
  code: string;
  /** Fraction of pure metal, 0–1 (22K = 0.916). */
  fineness: number;
}

/** A market rate quote: `ratePerGram` is for metal of `purity`; other purities are derived through the fineness ratio. */
export interface MetalRateQuote {
  metalId: Id;
  purity: PurityRef;
  ratePerGram: Paise;
}

/** Everything the arithmetic needs, with rules already chosen. Pure input → pure output. */
export interface PriceCalculationInput {
  metalId: Id;
  purity: PurityRef;
  grossWeight: Grams;
  stoneWeight: Grams;
  /** Optional: derived as gross − stone. When given it must equal that. */
  netWeight?: Grams;
  /** Optional: derived as net × fineness. When given it must agree within 1 mg. */
  fineWeight?: Grams;
  /** Pieces in the line; weights, stone value and cost are line totals. Defaults to 1. */
  pieces?: number;
  metalRate: MetalRateQuote;
  stoneValue: Paise;
  /** The line's book cost, if known — enables margin. */
  cost?: Paise;
  makingRule?: MakingTerms;
  wastageRule?: WastageTerms;
  discountRule?: Discount;
  taxRule: TaxTerms & { id?: Id };
  sellerState: string;
  buyerState: string;
}

/** Who is buying and what is being sold — what rule resolution needs. `asOf` is explicit: the engine never reads a clock. */
export interface PricingContext {
  asOf: Date;
  channel: Channel;
  customerType: CustomerType;
  customerId?: Id;
  customerGroupId?: Id;
  priceListId?: Id;
  categoryId?: Id;
}

export interface PriceItemRequest extends Omit<PriceCalculationInput, "makingRule" | "wastageRule" | "discountRule"> {
  context: PricingContext;
  /** Candidate rules (any number, any order — the result never depends on order). */
  rules: readonly PricingRule[];
  /** A hand-entered value for a dimension, replacing whatever resolution picked (what-if pricing, sales overrides). */
  overrides?: { makingRule?: MakingTerms; wastageRule?: WastageTerms; discountRule?: Discount };
}

/** Precedence of a rule's scope, most specific first. */
export type RuleTier = "CUSTOMER" | "CUSTOMER_GROUP" | "PRICE_LIST" | "CATEGORY" | "DEFAULT";

export type RuleSource =
  | { kind: "RULE"; ruleId: Id; ruleName: string; tier: RuleTier; priority: number; shadowedRuleIds: Id[] }
  /** Supplied by the caller in `overrides`. */
  | { kind: "OVERRIDE" }
  /** Passed straight to `calculatePrice`, no resolution involved. */
  | { kind: "INPUT" };

export interface AppliedRule<T> {
  terms: T;
  source: RuleSource;
}

export type PricingWarningCode = "AMBIGUOUS_RULES" | "NO_MAKING_RULE" | "BELOW_COST";
export interface PricingWarning {
  code: PricingWarningCode;
  message: string;
}

export type SupplyType = "INTRA_STATE" | "INTER_STATE";

/**
 * A complete, self-describing price. Every component is here, and the parts always add up:
 *   subtotal     = metalValue + wastageValue + makingCharges + stoneValue
 *   taxableValue = subtotal − discount
 *   totalTax     = cgst + sgst + igst
 *   finalAmount  = taxableValue + totalTax
 * (Each component is rounded to the paisa once, half away from zero, so this holds exactly.)
 */
export interface PriceBreakdown {
  weights: { gross: Grams; stone: Grams; net: Grams; fine: Grams; pieces: number };
  rate: {
    quotedPurity: string;
    quotedFineness: number;
    /** The quote, for the quoted purity. */
    ratePerGram: Paise;
    /** The rate carried over to this item's purity, to 2 decimals of a paisa. Informational — the values below are computed exactly, not from this. */
    effectiveRatePerGram: number;
  };

  metalValue: Paise;
  wastageWeight: Grams;
  wastageValue: Paise;
  makingCharges: Paise;
  stoneValue: Paise;
  subtotal: Paise;
  discount: Paise;
  taxableValue: Paise;
  taxes: {
    supplyType: SupplyType;
    hsnCode: string;
    taxRuleId?: Id;
    cgstRate: number;
    sgstRate: number;
    igstRate: number;
    cgst: Paise;
    sgst: Paise;
    igst: Paise;
  };
  totalTax: Paise;
  finalAmount: Paise;

  /** Null when no cost was supplied — never a misleading zero. */
  estimatedCost: Paise | null;
  /** taxableValue − estimatedCost. Sensitive: never expose to customers or channels that lack cost visibility. */
  grossMargin: Paise | null;
  /** Margin as a percentage of taxableValue, 2 decimals. Null without cost, or when taxableValue is 0. */
  marginPercentage: number | null;

  /** The terms actually applied and where each came from — the audit trail for "why this price". */
  rules: { making: AppliedRule<MakingTerms> | null; wastage: AppliedRule<WastageTerms> | null; discount: AppliedRule<Discount> | null };
  warnings: PricingWarning[];
}

/** Metals and their purities, with the fineness the engine needs — reference data for the pricing playground. */
export interface PricingMetalOption {
  id: Id;
  code: string;
  name: string;
  purities: PurityRef[];
}
export interface PricingPlaygroundMeta {
  metals: PricingMetalOption[];
}
