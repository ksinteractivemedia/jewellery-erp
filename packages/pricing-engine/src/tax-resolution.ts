import type { TaxRule } from "@jewellery/types";
import { PricingError } from "./errors";

/**
 * The one tax rule for an HSN code on a date: active, effective (validFrom inclusive, validTo exclusive),
 * latest validFrom wins. Two rules that start at the same instant are refused rather than guessed between —
 * a wrong rate here is tax owed to the government, not a discount someone can reverse.
 */
export function resolveTaxRule(rules: readonly TaxRule[], query: { hsnCode: string; asOf: Date }): TaxRule {
  const at = query.asOf instanceof Date ? query.asOf.getTime() : Number.NaN;
  if (Number.isNaN(at)) throw new PricingError("INVALID_INPUT", "asOf must be a valid date", "asOf");
  const hsn = query.hsnCode.trim();
  const candidates = rules
    .filter((r) => r.isActive && r.hsnCode === hsn && r.validFrom.getTime() <= at && (!r.validTo || at < r.validTo.getTime()))
    .sort((a, b) => b.validFrom.getTime() - a.validFrom.getTime() || (a.id < b.id ? -1 : 1));
  const winner = candidates[0];
  if (!winner) throw new PricingError("NO_TAX_RULE", `no active tax rule for HSN ${hsn || "(none)"} on ${query.asOf.toISOString().slice(0, 10)}`, "hsnCode");
  const rival = candidates[1];
  if (rival && rival.validFrom.getTime() === winner.validFrom.getTime()) {
    throw new PricingError("AMBIGUOUS_TAX_RULE", `tax rules "${winner.name}" and "${rival.name}" both apply to HSN ${hsn} from the same date`, "hsnCode");
  }
  return winner;
}
