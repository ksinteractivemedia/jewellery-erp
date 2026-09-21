import type { PricingRule } from "@jewellery/types";
import { createPricingRuleSchema } from "@jewellery/validation";
import { findAmbiguousRules } from "@jewellery/pricing-engine";
import { ConflictError, DomainValidationError } from "../../shared/errors";

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

/**
 * Refuses to save a rule that would be AMBIGUOUS against the stored ones: same tier, priority,
 * specificity and start date, overlapping in time and scope, defining the same dimension — so only the
 * engine's arbitrary id tie-break would choose between them. (The engine resolves such a book
 * deterministically and warns; this stops the book from getting that way in the first place.)
 * `candidate` is the rule as it would be stored; `others` are the stored rules excluding it.
 */
export function assertNoAmbiguousPricingRule(candidate: PricingRule, others: readonly PricingRule[]): void {
  const clashes = findAmbiguousRules([candidate, ...others.filter((r) => r.id !== candidate.id)]).filter((pair) => pair.ruleIds.includes(candidate.id));
  if (clashes.length === 0) return;
  const rivals = others.filter((r) => clashes.some((pair) => pair.ruleIds.includes(r.id)));
  throw new ConflictError(
    `this pricing rule is ambiguous with ${rivals.map((r) => `"${r.name}"`).join(", ")}: they could apply to the same sale and rank equally (same tier, priority, scope and start date). Give one a different priority or narrower scope.`
  );
}
