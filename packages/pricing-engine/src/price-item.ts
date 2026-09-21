import type { AppliedRule, PriceBreakdown, PriceItemRequest, PricingWarning } from "@jewellery/types";
import { calculatePrice } from "./calculate";
import { resolvePricingRules, type RuleDimension } from "./rule-resolution";

const override = <T>(terms: T | undefined): AppliedRule<T> | undefined => (terms === undefined ? undefined : { terms, source: { kind: "OVERRIDE" } });

/**
 * Resolve the pricing rules for this customer and piece, then calculate. This is the entry point every
 * channel calls (ERP, B2C, B2B): they differ only in the `context` and `rules` they pass, never in code.
 * A hand-entered override replaces what resolution picked for that dimension and is recorded as such.
 */
export function priceItem(request: PriceItemRequest): PriceBreakdown {
  const { context, rules, overrides, ...calculation } = request;
  const resolved = resolvePricingRules(rules, { ...context, metalId: calculation.metalId, purity: calculation.purity.code });

  const making = override(overrides?.makingRule) ?? resolved.making;
  const wastage = override(overrides?.wastageRule) ?? resolved.wastage;
  const discount = override(overrides?.discountRule) ?? resolved.discount;

  const breakdown = calculatePrice({ ...calculation, makingRule: making?.terms, wastageRule: wastage?.terms, discountRule: discount?.terms });

  // An ambiguity only matters if the ambiguous rule's value was actually used.
  const overridden: Record<RuleDimension, boolean> = { making: Boolean(overrides?.makingRule), wastage: Boolean(overrides?.wastageRule), discount: Boolean(overrides?.discountRule) };
  const warnings: PricingWarning[] = (Object.keys(resolved.ambiguities) as RuleDimension[]).filter((d) => !overridden[d]).map((d) => resolved.ambiguities[d]!);
  if (!making) warnings.push({ code: "NO_MAKING_RULE", message: "no making charge rule applies to this customer and piece, so no making charge was added" });

  return { ...breakdown, rules: { making, wastage, discount }, warnings: [...warnings, ...breakdown.warnings] };
}
