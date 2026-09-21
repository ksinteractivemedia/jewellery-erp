export type PricingErrorCode =
  | "INVALID_INPUT"
  | "INVALID_WEIGHT"
  | "WEIGHT_MISMATCH"
  | "INVALID_RATE"
  | "METAL_MISMATCH"
  | "INVALID_RULE"
  | "DISCOUNT_EXCEEDS_BASE"
  | "NO_TAX_RULE"
  | "AMBIGUOUS_TAX_RULE"
  | "AMOUNT_TOO_LARGE";

/**
 * A price could not be computed because the input (or a stored rule) is unusable. The engine never
 * "does its best" with bad input — a silently wrong price is worse than a refused one.
 */
export class PricingError extends Error {
  constructor(
    public readonly code: PricingErrorCode,
    message: string,
    public readonly field?: string
  ) {
    super(message);
    this.name = "PricingError";
  }
}
