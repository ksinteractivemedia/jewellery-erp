import type { AppliedRule, PriceBreakdown, PriceCalculationInput, PricingWarning } from "@jewellery/types";
import { PricingError } from "./errors";
import { divRound, toFineness, toNumber, toPaise } from "./fixed-point";
import { calculateDiscount } from "./discount";
import { calculateMaking } from "./making";
import { metalValuePaise } from "./metal";
import { calculateTax } from "./tax";
import { calculateWastage } from "./wastage";
import { resolveWeights } from "./weights";

const applied = <T>(terms: T | undefined): AppliedRule<T> | null => (terms === undefined ? null : { terms, source: { kind: "INPUT" } });

/**
 * Pure arithmetic: rules are already chosen, nothing is read from a database or a clock, and the same
 * input always yields the same breakdown to the paisa. Order of calculation (business-rules.md §1.8):
 *
 *   metalValue   = net weight × the purity's rate
 *   wastage      = extra metal (weight, then valued like metal)
 *   making       = per its rule
 *   subtotal     = metal + wastage + making + stones
 *   discount     → taxableValue = subtotal − discount
 *   GST          = on taxableValue; finalAmount = taxableValue + tax
 *
 * Throws `PricingError` on unusable input instead of guessing.
 */
export function calculatePrice(input: PriceCalculationInput): PriceBreakdown {
  if (input.metalRate.metalId !== input.metalId) {
    throw new PricingError("METAL_MISMATCH", "the metal rate is for a different metal than the item", "metalRate.metalId");
  }
  const fineness6 = toFineness(input.purity.fineness, "purity.fineness");
  const quotedFineness6 = toFineness(input.metalRate.purity.fineness, "metalRate.purity.fineness");
  const ratePerGram = toPaise(input.metalRate.ratePerGram, "metalRate.ratePerGram");
  if (ratePerGram <= 0n) throw new PricingError("INVALID_RATE", "the metal rate must be greater than zero", "metalRate.ratePerGram");
  const stoneValue = toPaise(input.stoneValue, "stoneValue");
  const cost = input.cost === undefined ? undefined : toPaise(input.cost, "cost");

  const weights = resolveWeights(input, fineness6);

  const metalValue = metalValuePaise(weights.netMg, fineness6, ratePerGram, quotedFineness6);
  const wastage = calculateWastage(input.wastageRule, { netMg: weights.netMg, fineness6, ratePerGram, quotedFineness6 });
  const making = calculateMaking(input.makingRule, { metalValue, netMg: weights.netMg, pieces: weights.pieces });
  const subtotal = metalValue + wastage.value + making + stoneValue;
  const discount = calculateDiscount(input.discountRule, { making, subtotal });
  const taxableValue = subtotal - discount;
  const tax = calculateTax(input.taxRule, taxableValue, input.sellerState, input.buyerState);
  const totalTax = tax.cgst + tax.sgst + tax.igst;
  const finalAmount = taxableValue + totalTax;

  const warnings: PricingWarning[] = [];
  let grossMargin: bigint | null = null;
  let marginPercentage: number | null = null;
  if (cost !== undefined) {
    grossMargin = taxableValue - cost;
    if (taxableValue > 0n) marginPercentage = toNumber(divRound(grossMargin * 10_000n, taxableValue), "marginPercentage") / 100;
    if (grossMargin < 0n) warnings.push({ code: "BELOW_COST", message: "the taxable value is below the item's cost — this sale would lose money" });
  }

  return {
    weights: {
      gross: Number(weights.grossMg) / 1000,
      stone: Number(weights.stoneMg) / 1000,
      net: Number(weights.netMg) / 1000,
      fine: Number(weights.fineMg) / 1000,
      pieces: weights.pieces,
    },
    rate: {
      quotedPurity: input.metalRate.purity.code,
      quotedFineness: input.metalRate.purity.fineness,
      ratePerGram: toNumber(ratePerGram, "ratePerGram"),
      effectiveRatePerGram: toNumber(divRound(ratePerGram * fineness6 * 100n, quotedFineness6), "effectiveRatePerGram") / 100,
    },
    metalValue: toNumber(metalValue, "metalValue"),
    wastageWeight: Number(wastage.weightMg) / 1000,
    wastageValue: toNumber(wastage.value, "wastageValue"),
    makingCharges: toNumber(making, "makingCharges"),
    stoneValue: toNumber(stoneValue, "stoneValue"),
    subtotal: toNumber(subtotal, "subtotal"),
    discount: toNumber(discount, "discount"),
    taxableValue: toNumber(taxableValue, "taxableValue"),
    taxes: {
      supplyType: tax.supplyType,
      hsnCode: input.taxRule.hsnCode,
      ...(input.taxRule.id !== undefined ? { taxRuleId: input.taxRule.id } : {}),
      cgstRate: tax.cgstRate,
      sgstRate: tax.sgstRate,
      igstRate: tax.igstRate,
      cgst: toNumber(tax.cgst, "cgst"),
      sgst: toNumber(tax.sgst, "sgst"),
      igst: toNumber(tax.igst, "igst"),
    },
    totalTax: toNumber(totalTax, "totalTax"),
    finalAmount: toNumber(finalAmount, "finalAmount"),
    estimatedCost: cost === undefined ? null : toNumber(cost, "estimatedCost"),
    grossMargin: grossMargin === null ? null : toNumber(grossMargin, "grossMargin"),
    marginPercentage,
    rules: { making: applied(input.makingRule), wastage: applied(input.wastageRule), discount: applied(input.discountRule) },
    warnings,
  };
}

