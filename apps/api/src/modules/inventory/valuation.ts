import { valueOfMetal } from "@jewellery/pricing-engine";
import type { ItemValuation, MetalRate, Paise } from "@jewellery/types";

/**
 * Indicative metal value of a piece: its FINE weight at the market rate for pure metal. A rate is
 * quoted for one purity (say 24K at ₹6,500/g, fineness 0.999); pure metal is worth rate ÷ that
 * purity's fineness per gram, and the piece contains `fineWeight` grams of it. No making charge, no
 * stones, no tax — this is an asset figure for stock reports, not a selling price (that is the pricing
 * engine's job — see CLAUDE.md rule 1). The arithmetic is the engine's own `valueOfMetal`, so a stock
 * valuation and a price can never disagree about what a gram of metal is worth.
 */
export function metalMarketValue(fineWeight: number, ratePerGram: Paise, quotedFineness: number): Paise {
  if (quotedFineness <= 0 || quotedFineness > 1) throw new RangeError("quotedFineness must be in (0, 1]");
  return valueOfMetal({ weight: fineWeight, fineness: 1, ratePerGram, quotedFineness });
}

export function buildValuation(
  item: { cost: Paise; fineWeight: number; purity: string },
  rate: Pick<MetalRate, "ratePerGram" | "purity" | "effectiveFrom"> | null,
  quotedFineness: number | null
): ItemValuation {
  const base: ItemValuation = { costPaise: item.cost };
  if (!rate || quotedFineness === null) return { ...base, metalValueNote: "No current rate on file for this metal" };
  return {
    ...base,
    metalValuePaise: metalMarketValue(item.fineWeight, rate.ratePerGram, quotedFineness),
    ratePerGramPaise: rate.ratePerGram,
    ratePurity: rate.purity,
    rateEffectiveFrom: rate.effectiveFrom,
    ...(rate.purity !== item.purity ? { metalValueNote: `Derived from the ${rate.purity} rate` } : {}),
  };
}
