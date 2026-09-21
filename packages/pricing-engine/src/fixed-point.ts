import { PricingError } from "./errors";

/**
 * Exact arithmetic. Money is integer paise, weight is integer milligrams, and percentages / fineness are
 * integers scaled by 10⁶ — all multiplied and divided as BigInt, then rounded ONCE, half away from zero.
 * That is why "12.5% of ₹1,001" is the same paisa on every machine and never 1.4999999 rounded down.
 */
export const RATIO_SCALE = 1_000_000n;
export const PERCENT_DENOMINATOR = 100n * RATIO_SCALE;
export const MG_PER_GRAM = 1_000n;

/** `value` as an integer with `decimals` implied decimal places. Float noise (0.1 + 0.2) is tolerated; real extra precision is refused. */
export function toScaled(value: number, decimals: number, field: string): bigint {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new PricingError("INVALID_INPUT", `${field} must be a finite number`, field);
  const factor = 10 ** decimals;
  const scaled = Math.round(value * factor);
  if (Math.abs(value * factor - scaled) > 1e-6) throw new PricingError("INVALID_INPUT", `${field} allows at most ${decimals} decimal places`, field);
  if (!Number.isSafeInteger(scaled)) throw new PricingError("AMOUNT_TOO_LARGE", `${field} is too large`, field);
  return BigInt(scaled);
}

/** A whole, non-negative number of paise. */
export function toPaise(value: number, field: string): bigint {
  if (!Number.isSafeInteger(value) || value < 0) throw new PricingError("INVALID_INPUT", `${field} must be a whole number of paise, zero or more`, field);
  return BigInt(value);
}

/** A percent, 0–100, as an integer scaled by 10⁶. */
export function toPercent(value: number, field: string): bigint {
  const scaled = toScaled(value, 6, field);
  if (scaled < 0n || scaled > PERCENT_DENOMINATOR) throw new PricingError("INVALID_INPUT", `${field} must be between 0 and 100`, field);
  return scaled;
}

/** A fineness, in (0, 1], as an integer scaled by 10⁶. */
export function toFineness(value: number, field: string): bigint {
  const scaled = toScaled(value, 6, field);
  if (scaled <= 0n || scaled > RATIO_SCALE) throw new PricingError("INVALID_INPUT", `${field} must be greater than 0 and at most 1`, field);
  return scaled;
}

/** numerator ÷ denominator, rounded half away from zero. `denominator` must be positive. */
export function divRound(numerator: bigint, denominator: bigint): bigint {
  const magnitude = numerator < 0n ? -numerator : numerator;
  const quotient = (2n * magnitude + denominator) / (2n * denominator);
  return numerator < 0n ? -quotient : quotient;
}

/** BigInt back to a JS number, refusing anything Number can't hold exactly. */
export function toNumber(value: bigint, field: string): number {
  const n = Number(value);
  if (!Number.isSafeInteger(n)) throw new PricingError("AMOUNT_TOO_LARGE", `${field} is too large to represent`, field);
  return n;
}
