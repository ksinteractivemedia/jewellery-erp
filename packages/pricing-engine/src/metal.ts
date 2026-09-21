import { PricingError } from "./errors";
import { MG_PER_GRAM, divRound, toFineness, toNumber, toPaise, toScaled } from "./fixed-point";

/**
 * THE metal-value formula, used by pricing and by inventory valuation so the two can never drift
 * (CLAUDE.md rule 1). A rate is quoted for one purity (say 24K at fineness 0.999); metal of another
 * purity is worth `rate × fineness ÷ quotedFineness` per gram.
 */
export function metalValuePaise(weightMg: bigint, fineness6: bigint, ratePerGram: bigint, quotedFineness6: bigint): bigint {
  return divRound(weightMg * fineness6 * ratePerGram, MG_PER_GRAM * quotedFineness6);
}

/**
 * Number-in / number-out form of `metalValuePaise`. For pure metal (a piece's FINE weight) pass `fineness: 1`.
 * Not a selling price — no making, wastage, stones or tax.
 */
export function valueOfMetal(args: { weight: number; fineness: number; ratePerGram: number; quotedFineness: number }): number {
  if (args.weight < 0) throw new PricingError("INVALID_WEIGHT", "weight cannot be negative", "weight");
  const value = metalValuePaise(toScaled(args.weight, 3, "weight"), toFineness(args.fineness, "fineness"), toPaise(args.ratePerGram, "ratePerGram"), toFineness(args.quotedFineness, "quotedFineness"));
  return toNumber(value, "value");
}
