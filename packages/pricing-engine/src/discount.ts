import type { Discount } from "@jewellery/types";
import { PricingError } from "./errors";
import { PERCENT_DENOMINATOR, divRound, toPaise, toPercent } from "./fixed-point";

/**
 * A discount in paise, taken off `subtotal` (default) or off the making charges alone. A flat discount
 * bigger than what it is taken off is REFUSED rather than clamped: clamping would quietly sell the piece
 * for nothing when someone mistypes ₹50,000 for ₹5,000.
 */
export function calculateDiscount(rule: Discount | undefined, basis: { making: bigint; subtotal: bigint }): bigint {
  if (!rule) return 0n;
  const base = rule.appliesTo === "MAKING_CHARGES" ? basis.making : basis.subtotal;
  let amount: bigint;
  switch (rule.type) {
    case "PERCENTAGE":
      amount = divRound(base * toPercent(rule.value, "discount.value"), PERCENT_DENOMINATOR);
      break;
    case "FLAT":
      amount = toPaise(rule.value, "discount.value");
      break;
    default:
      throw new PricingError("INVALID_RULE", `unknown discount type "${String((rule as { type: unknown }).type)}"`, "discount.type");
  }
  if (amount > base) {
    throw new PricingError("DISCOUNT_EXCEEDS_BASE", `discount of ${amount} paise exceeds the ${rule.appliesTo === "MAKING_CHARGES" ? "making charges" : "subtotal"} it applies to (${base} paise)`, "discount.value");
  }
  return amount;
}
