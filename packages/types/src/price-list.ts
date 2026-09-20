import type { Channel, Id, Timestamps } from "./common";

/**
 * Versionable, effective-dated price list header. Editing a live price list creates a
 * new document with `version + 1` and a new `effectiveFrom`; the previous version is
 * never mutated (business-rules.md §7.2's sibling rule for pricing documents) — its
 * `effectiveTo` is set instead. `PricingRule.priceListId` references whichever version
 * is active as of the transaction date.
 */
export interface PriceList extends Timestamps {
  id: Id;
  /** Stable across versions — this is what a rule/customer actually points at conceptually. */
  code: string;
  name: string;
  version: number;
  customerGroupId?: Id;
  customerId?: Id;
  channel: Channel | "BOTH";
  effectiveFrom: Date;
  effectiveTo?: Date;
  isActive: boolean;
}
