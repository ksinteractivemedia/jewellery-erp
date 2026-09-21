import type { SupplyType, TaxTerms } from "@jewellery/types";
import { PricingError } from "./errors";
import { PERCENT_DENOMINATOR, divRound, toPercent } from "./fixed-point";

export interface TaxResult {
  supplyType: SupplyType;
  cgstRate: number;
  sgstRate: number;
  igstRate: number;
  cgst: bigint;
  sgst: bigint;
  igst: bigint;
}

const normalizeState = (state: string, field: string) => {
  const normalized = typeof state === "string" ? state.trim().toUpperCase() : "";
  if (!normalized) throw new PricingError("INVALID_INPUT", `${field} is required to decide CGST/SGST versus IGST`, field);
  return normalized;
};

/**
 * Tax on the taxable value. The engine decides only WHICH side of the rule applies — same state → the
 * rule's CGST + SGST, different states → its IGST. Every rate is read from the rule (business-rules.md §6.2),
 * and each component is rounded on its own, as it is printed on the invoice.
 */
export function calculateTax(rule: TaxTerms, taxable: bigint, sellerState: string, buyerState: string): TaxResult {
  const intra = normalizeState(sellerState, "sellerState") === normalizeState(buyerState, "buyerState");
  const tax = (rate: number, field: string) => divRound(taxable * toPercent(rate, field), PERCENT_DENOMINATOR);
  if (intra) {
    return {
      supplyType: "INTRA_STATE",
      cgstRate: rule.intraState.cgst,
      sgstRate: rule.intraState.sgst,
      igstRate: 0,
      cgst: tax(rule.intraState.cgst, "taxRule.intraState.cgst"),
      sgst: tax(rule.intraState.sgst, "taxRule.intraState.sgst"),
      igst: 0n,
    };
  }
  return {
    supplyType: "INTER_STATE",
    cgstRate: 0,
    sgstRate: 0,
    igstRate: rule.interState.igst,
    cgst: 0n,
    sgst: 0n,
    igst: tax(rule.interState.igst, "taxRule.interState.igst"),
  };
}
