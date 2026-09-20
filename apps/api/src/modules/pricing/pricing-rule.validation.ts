import type { PricingRule } from "@jewellery/types";
import { createPricingRuleSchema } from "@jewellery/validation";
import { DomainValidationError } from "../../shared/errors";

/**
 * Re-runs the full create-time business validation (packages/validation's cross-field
 * refinements — at least one calculation dimension set, percentage bounds, date range)
 * against a merged (existing + patch) rule. `updatePricingRuleFieldsSchema` deliberately
 * skips these refinements on a partial patch alone, so this is the point that catches
 * "the patch alone looked fine but the resulting rule is invalid" — e.g. clearing
 * `makingChargeType` on a rule that has no wastage or discount either.
 */
export function assertValidMergedPricingRule(merged: Partial<PricingRule> & Record<string, unknown>): void {
  const result = createPricingRuleSchema.safeParse(merged);
  if (!result.success) {
    throw new DomainValidationError(result.error.issues.map((i) => i.message).join("; "));
  }
}

export function isRuleEffective(rule: PricingRule, asOf: Date = new Date()): boolean {
  if (!rule.isActive) return false;
  if (rule.validFrom > asOf) return false;
  if (rule.validTo && rule.validTo < asOf) return false;
  return true;
}

/**
 * How many scoping dimensions a rule pins down — used only to break priority ties in
 * `resolveApplicableRule` (a rule that names an exact metal+purity+category is "more
 * specific" than one that only names a channel).
 */
function specificity(rule: PricingRule): number {
  return [rule.customerType, rule.customerGroupId, rule.priceListId, rule.metalId, rule.purity, rule.categoryId].filter(Boolean).length;
}

/**
 * Picks the single rule that applies out of a candidate set already filtered to the
 * relevant scope (same metal/category/customer/etc. — that filtering is the pricing
 * engine's job, Phase 2). Resolution order: effective now, highest `priority`, then
 * most specific, then most recently created (stable tie-break).
 */
export function resolveApplicableRule(rules: PricingRule[], asOf: Date = new Date()): PricingRule | undefined {
  const effective = rules.filter((rule) => isRuleEffective(rule, asOf));
  if (effective.length === 0) return undefined;

  return effective.sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    const specificityDiff = specificity(b) - specificity(a);
    if (specificityDiff !== 0) return specificityDiff;
    return b.validFrom.getTime() - a.validFrom.getTime();
  })[0];
}
