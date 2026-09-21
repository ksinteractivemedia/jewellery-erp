import type { PriceCalculationInput } from "@jewellery/types";
import { PricingError } from "./errors";
import { RATIO_SCALE, divRound, toScaled } from "./fixed-point";

const MAX_WEIGHT_MG = 1_000_000_000n; // 1,000 kg — far beyond any jewellery line
const MAX_PIECES = 1_000_000;

export interface ResolvedWeights {
  grossMg: bigint;
  stoneMg: bigint;
  netMg: bigint;
  fineMg: bigint;
  pieces: number;
}

/**
 * Settles the four weights of a line. A weight that was supplied AND is derivable (net, fine) is
 * checked against the derived value rather than trusted or silently replaced: two disagreeing
 * sources of truth for the same number is exactly how a wrong price gets through.
 */
export function resolveWeights(input: Pick<PriceCalculationInput, "grossWeight" | "stoneWeight" | "netWeight" | "fineWeight" | "pieces">, fineness6: bigint): ResolvedWeights {
  const grossMg = toScaled(input.grossWeight, 3, "grossWeight");
  const stoneMg = toScaled(input.stoneWeight, 3, "stoneWeight");
  if (grossMg <= 0n) throw new PricingError("INVALID_WEIGHT", "grossWeight must be greater than zero", "grossWeight");
  if (grossMg > MAX_WEIGHT_MG) throw new PricingError("INVALID_WEIGHT", "grossWeight is implausibly large", "grossWeight");
  if (stoneMg < 0n) throw new PricingError("INVALID_WEIGHT", "stoneWeight cannot be negative", "stoneWeight");
  if (stoneMg >= grossMg) throw new PricingError("INVALID_WEIGHT", "stoneWeight must be less than grossWeight — a metal piece needs a positive net weight", "stoneWeight");

  const netMg = grossMg - stoneMg;
  if (input.netWeight !== undefined && toScaled(input.netWeight, 3, "netWeight") !== netMg) {
    throw new PricingError("WEIGHT_MISMATCH", `netWeight ${input.netWeight} g does not equal grossWeight − stoneWeight (${Number(netMg) / 1000} g)`, "netWeight");
  }

  const fineMg = divRound(netMg * fineness6, RATIO_SCALE);
  if (input.fineWeight !== undefined) {
    const given = toScaled(input.fineWeight, 3, "fineWeight");
    const drift = given > fineMg ? given - fineMg : fineMg - given;
    if (drift > 1n) throw new PricingError("WEIGHT_MISMATCH", `fineWeight ${input.fineWeight} g does not match netWeight × fineness (${Number(fineMg) / 1000} g)`, "fineWeight");
  }

  const pieces = input.pieces ?? 1;
  if (!Number.isInteger(pieces) || pieces < 1 || pieces > MAX_PIECES) throw new PricingError("INVALID_INPUT", "pieces must be a whole number of at least 1", "pieces");

  return { grossMg, stoneMg, netMg, fineMg, pieces };
}
