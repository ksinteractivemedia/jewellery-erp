import type { Channel, CustomerType, Id, Paise } from "./common";

/**
 * How a making charge is computed. Values for PER_GRAM / FIXED / PER_PIECE are integer paise;
 * PERCENTAGE is a percent (0–100) of the metal value.
 *  - PERCENTAGE: % of the metal value
 *  - PER_GRAM:   paise per gram of NET weight
 *  - FIXED:      paise for the whole line, however many pieces it holds
 *  - PER_PIECE:  paise multiplied by the number of pieces
 */
export type MakingChargeType = "PERCENTAGE" | "PER_GRAM" | "FIXED" | "PER_PIECE";

/**
 * How wastage (the metal lost while crafting, charged to the buyer) is computed.
 * NONE is a real choice, not an absence: a customer-specific rule saying NONE overrides a default that charges wastage.
 *  - PERCENTAGE:   % of NET weight
 *  - FIXED_WEIGHT: grams, for the whole line
 */
export type WastageType = "PERCENTAGE" | "FIXED_WEIGHT" | "NONE";

export type DiscountType = "PERCENTAGE" | "FLAT";

/** What a discount is taken off: the whole pre-tax subtotal, or just the making charges ("50% off making"). */
export type DiscountAppliesTo = "TOTAL" | "MAKING_CHARGES";

export interface Discount {
  type: DiscountType;
  /** PERCENTAGE: 0–100. FLAT: integer paise. */
  value: number;
  /** Defaults to TOTAL. */
  appliesTo?: DiscountAppliesTo;
}

/** The pure "terms" of each dimension — what the engine's arithmetic consumes, whether they came from a stored rule or were typed in. */
export interface MakingTerms {
  type: MakingChargeType;
  value: number;
}
export type WastageTerms = { type: "NONE" } | { type: "PERCENTAGE" | "FIXED_WEIGHT"; value: number };

/**
 * A configurable rule the pricing engine evaluates (packages/pricing-engine) — never hardcoded math
 * (business-rules.md §1.1). A rule may define any of making / wastage / discount; the engine resolves
 * each of those three dimensions independently, so a customer-specific "5% off" rule does not erase
 * the default making charge.
 *
 * Scope fields are all optional; a rule only applies when EVERY scope field it sets matches the
 * calculation. Which rule wins among several that apply is fixed by `resolvePricingRules`:
 * tier (customer → customer group → price list → category → default), then `priority`,
 * then specificity, then most recent `validFrom`, then id — see docs/business-rules.md §1.4.
 */
export interface PricingRule {
  id: Id;
  name: string;

  // Scope — all optional.
  /** Customer-specific rule (the most specific tier). */
  customerId?: Id;
  customerGroupId?: Id;
  priceListId?: Id;
  categoryId?: Id;
  customerType?: CustomerType;
  metalId?: Id;
  purity?: string;
  channel: Channel | "BOTH";

  // Making charge.
  makingChargeType?: MakingChargeType;
  /** Percent for PERCENTAGE; integer paise for PER_GRAM / FIXED / PER_PIECE. */
  makingChargeValue?: Paise | number;

  // Wastage.
  wastageType?: WastageType;
  /** Percent for PERCENTAGE; grams (max 3 decimals) for FIXED_WEIGHT; absent for NONE. */
  wastageValue?: number;

  // Discount.
  discount?: Discount;

  /** Breaks ties inside one tier — higher wins. It never lets a lower tier beat a higher one. */
  priority: number;
  /** Effective from this instant (inclusive) … */
  validFrom: Date;
  /** … until this instant (exclusive), so back-to-back rules never overlap. */
  validTo?: Date;
  isActive: boolean;
}
