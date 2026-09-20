import type { CalculationType, Channel, CustomerType, Id } from "./common";

export type DiscountType = "PERCENTAGE" | "FLAT";

export interface Discount {
  type: DiscountType;
  value: number;
}

/**
 * A configurable rule the pricing engine evaluates (packages/pricing-engine, Phase 2) —
 * never hardcoded math (business-rules.md §1.1, §1.6's sibling rule for pricing).
 *
 * Every scoping field is optional; a rule with fewer scoping fields set is more general.
 * When several rules match the same calculation, `priority` (higher wins) breaks the tie —
 * see pricing-rule.validation.ts for the resolution contract this implies.
 */
export interface PricingRule {
  id: Id;
  name: string;

  // Scope — all optional, narrower + higher priority wins.
  customerType?: CustomerType;
  customerGroupId?: Id;
  priceListId?: Id;
  metalId?: Id;
  purity?: string;
  categoryId?: Id;
  channel: Channel | "BOTH";

  // Making charge.
  makingChargeType?: CalculationType;
  makingChargeValue?: number;

  // Wastage.
  wastageType?: Exclude<CalculationType, "FLAT">;
  wastageValue?: number;

  // Discount.
  discount?: Discount;

  priority: number;
  validFrom: Date;
  validTo?: Date;
  isActive: boolean;
}
