import type { WastageTerms } from "@jewellery/types";
import { PricingError } from "./errors";
import { PERCENT_DENOMINATOR, divRound, toPercent, toScaled } from "./fixed-point";
import { metalValuePaise } from "./metal";

export interface WastageResult {
  weightMg: bigint;
  value: bigint;
}

/**
 * Wastage is extra metal the buyer pays for, so it is weighed and then valued exactly like the piece's own metal:
 *  PERCENTAGE   → % of NET weight
 *  FIXED_WEIGHT → that many grams for the whole line
 *  NONE         → nothing
 */
export function calculateWastage(
  rule: WastageTerms | undefined,
  basis: { netMg: bigint; fineness6: bigint; ratePerGram: bigint; quotedFineness6: bigint }
): WastageResult {
  if (!rule || rule.type === "NONE") return { weightMg: 0n, value: 0n };

  let weightMg: bigint;
  switch (rule.type) {
    case "PERCENTAGE":
      weightMg = divRound(basis.netMg * toPercent(rule.value, "wastage.value"), PERCENT_DENOMINATOR);
      break;
    case "FIXED_WEIGHT":
      weightMg = toScaled(rule.value, 3, "wastage.value");
      if (weightMg < 0n) throw new PricingError("INVALID_RULE", "wastage weight cannot be negative", "wastage.value");
      if (weightMg > basis.netMg) throw new PricingError("INVALID_RULE", "wastage cannot exceed the net weight", "wastage.value");
      break;
    default:
      throw new PricingError("INVALID_RULE", `unknown wastage type "${String((rule as { type: unknown }).type)}"`, "wastage.type");
  }
  return { weightMg, value: metalValuePaise(weightMg, basis.fineness6, basis.ratePerGram, basis.quotedFineness6) };
}
