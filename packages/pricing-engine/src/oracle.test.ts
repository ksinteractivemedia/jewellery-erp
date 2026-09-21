import { describe, expect, it } from "vitest";
import { calculatePrice } from "./calculate";
import { GOLD, GST_7113 } from "./fixtures";
import { ORACLE_CASES } from "./oracle-cases";

/**
 * 60 random pieces priced by oracle/oracle.py — an independent, exact-fraction calculator that shares no code
 * with the engine. If the two ever disagree by a single paisa, one of them has a bug.
 */
describe("calculatePrice agrees with the independent oracle", () => {
  it("has a meaningful number of cases across every rule type", () => {
    expect(ORACLE_CASES.length).toBe(60);
    const seen = new Set(ORACLE_CASES.flatMap((c) => [c.making?.type, c.wastage?.type, c.discount?.type, c.discount?.appliesTo, c.intra ? "intra" : "inter"]));
    for (const kind of ["PERCENTAGE", "PER_GRAM", "FIXED", "PER_PIECE", "FIXED_WEIGHT", "NONE", "FLAT", "TOTAL", "MAKING_CHARGES", "intra", "inter"]) expect(seen).toContain(kind);
  });

  it.each(ORACLE_CASES.map((c, i) => [i, c] as const))("case %i", (_i, c) => {
    const purity = { code: c.purity, fineness: c.fineness };
    const b = calculatePrice({
      metalId: GOLD,
      purity,
      grossWeight: c.gross,
      stoneWeight: c.stone,
      pieces: c.pieces,
      metalRate: { metalId: GOLD, purity: { code: "quote", fineness: c.quotedFineness }, ratePerGram: c.rate },
      stoneValue: c.stoneValue,
      cost: c.cost,
      makingRule: c.making,
      wastageRule: c.wastage as never,
      discountRule: c.discount,
      taxRule: GST_7113,
      sellerState: "Maharashtra",
      buyerState: c.intra ? "Maharashtra" : "Kerala",
    });
    const e = c.expected;
    expect({
      net: b.weights.net, fine: b.weights.fine, metalValue: b.metalValue, wastageWeight: b.wastageWeight, wastageValue: b.wastageValue,
      makingCharges: b.makingCharges, subtotal: b.subtotal, discount: b.discount, taxableValue: b.taxableValue,
      cgst: b.taxes.cgst, sgst: b.taxes.sgst, igst: b.taxes.igst, totalTax: b.totalTax, finalAmount: b.finalAmount,
    }).toEqual({
      net: e.net, fine: e.fine, metalValue: e.metalValue, wastageWeight: e.wastageWeight, wastageValue: e.wastageValue,
      makingCharges: e.makingCharges, subtotal: e.subtotal, discount: e.discount, taxableValue: e.taxableValue,
      cgst: e.cgst, sgst: e.sgst, igst: e.igst, totalTax: e.totalTax, finalAmount: e.finalAmount,
    });
    if (c.cost !== undefined) {
      expect(b.grossMargin).toBe(e.grossMargin);
      expect(b.marginPercentage).toBe(e.marginPercentage ?? null);
    } else {
      expect(b.grossMargin).toBeNull();
    }
  });
});
