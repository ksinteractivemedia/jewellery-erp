import type { MakingTerms } from "@jewellery/types";
import { PricingError } from "./errors";
import { MG_PER_GRAM, PERCENT_DENOMINATOR, divRound, toPaise, toPercent } from "./fixed-point";

/**
 * Making charge, in paise. Basis per type (docs/business-rules.md §1.8):
 *  PERCENTAGE → % of the METAL value (not of wastage, stones or the subtotal)
 *  PER_GRAM   → paise per gram of NET weight
 *  FIXED      → paise for the whole line
 *  PER_PIECE  → paise × pieces
 */
export function calculateMaking(rule: MakingTerms | undefined, basis: { metalValue: bigint; netMg: bigint; pieces: number }): bigint {
  if (!rule) return 0n;
  switch (rule.type) {
    case "PERCENTAGE":
      return divRound(basis.metalValue * toPercent(rule.value, "making.value"), PERCENT_DENOMINATOR);
    case "PER_GRAM":
      return divRound(basis.netMg * toPaise(rule.value, "making.value"), MG_PER_GRAM);
    case "FIXED":
      return toPaise(rule.value, "making.value");
    case "PER_PIECE":
      return toPaise(rule.value, "making.value") * BigInt(basis.pieces);
    default:
      throw new PricingError("INVALID_RULE", `unknown making charge type "${String((rule as { type: unknown }).type)}"`, "making.type");
  }
}
