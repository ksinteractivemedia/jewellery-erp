import { describe, expect, it } from "vitest";
import type { PriceBreakdown, PriceCalculationInput } from "@jewellery/types";
import { calculatePrice } from "./calculate";
import { PricingError } from "./errors";
import { GOLD, GST_7113, P18K, P22K, P24K, P925, P999, SILVER, deepFreeze, necklace, seeded } from "./fixtures";

/** The identities every breakdown must satisfy, whatever the inputs (see PriceBreakdown in @jewellery/types). */
function expectAddsUp(b: PriceBreakdown) {
  expect(b.subtotal).toBe(b.metalValue + b.wastageValue + b.makingCharges + b.stoneValue);
  expect(b.taxableValue).toBe(b.subtotal - b.discount);
  expect(b.totalTax).toBe(b.taxes.cgst + b.taxes.sgst + b.taxes.igst);
  expect(b.finalAmount).toBe(b.taxableValue + b.totalTax);
  for (const paise of [b.metalValue, b.wastageValue, b.makingCharges, b.stoneValue, b.subtotal, b.discount, b.taxableValue, b.totalTax, b.finalAmount]) {
    expect(Number.isSafeInteger(paise)).toBe(true);
    expect(paise).toBeGreaterThanOrEqual(0);
  }
}

const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (error) {
    return error instanceof PricingError ? error.code : `unexpected: ${String(error)}`;
  }
  return "no error";
};

describe("calculatePrice — realistic jewellery scenarios (expected values from an independent calculator)", () => {
  // Every figure below was computed by oracle/oracle.py using exact fractions, then checked by hand.
  const scenarios: { name: string; input: PriceCalculationInput; expected: Record<string, unknown> }[] = [
    {
      name: "S1 — 22K gold necklace, B2C, 12% making + 2% wastage + stones, same-state GST (with cost)",
      input: necklace({ cost: 15_800_000 }),
      expected: {
        weights: { gross: 25, stone: 1.5, net: 23.5, fine: 21.526, pieces: 1 },
        // 23.500 g × ₹6,500 (the quote is already for 22K) = ₹1,52,750.00
        metalValue: 15_275_000,
        // 2% of 23.500 g = 0.470 g, valued as 22K metal: 0.470 × ₹6,500 = ₹3,055
        wastageWeight: 0.47,
        wastageValue: 305_500,
        // 12% of the METAL value (not of the subtotal)
        makingCharges: 1_833_000,
        stoneValue: 450_000,
        subtotal: 17_863_500,
        discount: 0,
        taxableValue: 17_863_500,
        // 1.5% of 17,863,500 = 267,952.5 → each half rounds up to 267,953 (as printed on the invoice)
        taxes: { supplyType: "INTRA_STATE", hsnCode: "7113", cgstRate: 1.5, sgstRate: 1.5, igstRate: 0, cgst: 267_953, sgst: 267_953, igst: 0 },
        totalTax: 535_906,
        finalAmount: 18_399_406,
        estimatedCost: 15_800_000,
        grossMargin: 2_063_500,
        marginPercentage: 11.55,
      },
    },
    {
      name: "S2 — 22K piece priced off today's 24K rate, per-gram making, no wastage, inter-state IGST",
      input: necklace({ grossWeight: 10, stoneWeight: 0, metalRate: { metalId: GOLD, purity: P24K, ratePerGram: 710_000 }, stoneValue: 0, makingRule: { type: "PER_GRAM", value: 45_000 }, wastageRule: undefined, buyerState: "Karnataka" }),
      expected: {
        weights: { gross: 10, stone: 0, net: 10, fine: 9.16, pieces: 1 },
        // ₹7,100 × 0.916 ÷ 0.999 = ₹6,510.11/g at 22K
        rate: { quotedPurity: "24K", quotedFineness: 0.999, ratePerGram: 710_000, effectiveRatePerGram: 651_011.01 },
        metalValue: 6_510_110,
        wastageWeight: 0,
        wastageValue: 0,
        makingCharges: 450_000,
        subtotal: 6_960_110,
        taxableValue: 6_960_110,
        taxes: { supplyType: "INTER_STATE", cgstRate: 0, sgstRate: 0, igstRate: 3, cgst: 0, sgst: 0, igst: 208_803 },
        totalTax: 208_803,
        finalAmount: 7_168_913,
        estimatedCost: null,
        grossMargin: null,
        marginPercentage: null,
      },
    },
    {
      name: "S3 — 18K diamond ring: per-gram making, fixed-weight wastage, 5% discount, sold below cost",
      input: necklace({
        purity: P18K,
        grossWeight: 6.2,
        stoneWeight: 0.45,
        metalRate: { metalId: GOLD, purity: P24K, ratePerGram: 710_000 },
        stoneValue: 1_850_000,
        makingRule: { type: "PER_GRAM", value: 65_000 },
        wastageRule: { type: "FIXED_WEIGHT", value: 0.15 },
        discountRule: { type: "PERCENTAGE", value: 5 },
        cost: 6_000_000,
        buyerState: "Karnataka",
      }),
      expected: {
        weights: { gross: 6.2, stone: 0.45, net: 5.75, fine: 4.313, pieces: 1 },
        metalValue: 3_064_940,
        wastageWeight: 0.15,
        wastageValue: 79_955,
        makingCharges: 373_750,
        stoneValue: 1_850_000,
        subtotal: 5_368_645,
        // 5% of the whole subtotal
        discount: 268_432,
        taxableValue: 5_100_213,
        taxes: { supplyType: "INTER_STATE", igst: 153_006 },
        totalTax: 153_006,
        finalAmount: 5_253_219,
        estimatedCost: 6_000_000,
        grossMargin: -899_787,
        marginPercentage: -17.64,
      },
    },
    {
      name: "S4 — 925 silver anklet, per-gram making, no wastage",
      input: necklace({
        metalId: SILVER,
        purity: P925,
        grossWeight: 42.5,
        stoneWeight: 0,
        metalRate: { metalId: SILVER, purity: P999, ratePerGram: 9_500 },
        stoneValue: 0,
        makingRule: { type: "PER_GRAM", value: 800 },
        wastageRule: { type: "NONE" },
      }),
      expected: {
        weights: { gross: 42.5, stone: 0, net: 42.5, fine: 39.313, pieces: 1 },
        rate: { quotedPurity: "999", quotedFineness: 0.999, ratePerGram: 9_500, effectiveRatePerGram: 8_796.3 },
        metalValue: 373_843,
        makingCharges: 34_000,
        subtotal: 407_843,
        taxes: { cgst: 6_118, sgst: 6_118, igst: 0 },
        totalTax: 12_236,
        finalAmount: 420_079,
      },
    },
    {
      name: "S5 — B2B lot of 10 22K bangles: per-piece making, 1% wastage, flat discount",
      input: necklace({
        grossWeight: 80,
        stoneWeight: 0,
        pieces: 10,
        stoneValue: 0,
        makingRule: { type: "PER_PIECE", value: 35_000 },
        wastageRule: { type: "PERCENTAGE", value: 1 },
        discountRule: { type: "FLAT", value: 200_000 },
      }),
      expected: {
        weights: { gross: 80, stone: 0, net: 80, fine: 73.28, pieces: 10 },
        metalValue: 52_000_000,
        wastageWeight: 0.8,
        wastageValue: 520_000,
        // ₹350 × 10 pieces
        makingCharges: 350_000,
        subtotal: 52_870_000,
        discount: 200_000,
        taxableValue: 52_670_000,
        taxes: { cgst: 790_050, sgst: 790_050, igst: 0 },
        totalTax: 1_580_100,
        finalAmount: 54_250_100,
      },
    },
    {
      name: "S6 — 18K pendant: fixed making, 100% off the making charge only, below cost",
      input: necklace({
        purity: P18K,
        grossWeight: 3.333,
        stoneWeight: 0.333,
        metalRate: { metalId: GOLD, purity: P24K, ratePerGram: 710_000 },
        stoneValue: 0,
        makingRule: { type: "FIXED", value: 120_000 },
        wastageRule: undefined,
        discountRule: { type: "PERCENTAGE", value: 100, appliesTo: "MAKING_CHARGES" },
        cost: 3_000_000,
        buyerState: "Karnataka",
      }),
      expected: {
        weights: { gross: 3.333, stone: 0.333, net: 3, fine: 2.25, pieces: 1 },
        metalValue: 1_599_099,
        makingCharges: 120_000,
        subtotal: 1_719_099,
        discount: 120_000,
        taxableValue: 1_599_099,
        taxes: { igst: 47_973 },
        finalAmount: 1_647_072,
        grossMargin: -1_400_901,
        marginPercentage: -87.61,
      },
    },
    {
      name: "S7 — a 3-decimal weight is priced exactly, not through a rounded fine weight",
      // 10.005 g × ₹6,500 = ₹65,032.50. (Going via fine weight 9.165 g would have said ₹65,035.48.)
      input: necklace({ grossWeight: 10.005, stoneWeight: 0, stoneValue: 0, makingRule: { type: "PERCENTAGE", value: 10 }, wastageRule: undefined }),
      expected: { weights: { net: 10.005, fine: 9.165 }, metalValue: 6_503_250, makingCharges: 650_325, subtotal: 7_153_575, taxes: { cgst: 107_304, sgst: 107_304 }, finalAmount: 7_368_183 },
    },
    {
      name: "S8 — 24K coin with a fixed making charge",
      input: necklace({ purity: P24K, grossWeight: 10, stoneWeight: 0, metalRate: { metalId: GOLD, purity: P24K, ratePerGram: 710_000 }, stoneValue: 0, makingRule: { type: "FIXED", value: 50_000 }, wastageRule: undefined }),
      expected: { weights: { fine: 9.99 }, metalValue: 7_100_000, makingCharges: 50_000, finalAmount: 7_364_500 },
    },
    {
      name: "S9 — 950 platinum-grade piece with wastage, stones and a 2.5% discount",
      input: necklace({
        purity: { code: "950", fineness: 0.95 },
        grossWeight: 15.25,
        stoneWeight: 0.25,
        metalRate: { metalId: GOLD, purity: { code: "950", fineness: 0.95 }, ratePerGram: 320_000 },
        stoneValue: 120_000,
        makingRule: { type: "PERCENTAGE", value: 18 },
        wastageRule: { type: "PERCENTAGE", value: 3 },
        discountRule: { type: "PERCENTAGE", value: 2.5 },
        cost: 4_000_000,
      }),
      expected: { metalValue: 4_800_000, wastageWeight: 0.45, wastageValue: 144_000, makingCharges: 864_000, subtotal: 5_928_000, discount: 148_200, taxableValue: 5_779_800, totalTax: 173_394, finalAmount: 5_953_194, grossMargin: 1_779_800, marginPercentage: 30.79 },
    },
  ];

  it.each(scenarios)("$name", ({ input, expected }) => {
    const breakdown = calculatePrice(input);
    expect(breakdown).toMatchObject(expected);
    expectAddsUp(breakdown);
  });

  it("returns the complete breakdown, never just a final number", () => {
    const b = calculatePrice(necklace());
    expect(Object.keys(b)).toEqual(
      expect.arrayContaining(["weights", "rate", "metalValue", "wastageWeight", "wastageValue", "makingCharges", "stoneValue", "subtotal", "discount", "taxableValue", "taxes", "totalTax", "finalAmount", "estimatedCost", "grossMargin", "marginPercentage", "rules", "warnings"])
    );
  });
});

describe("calculatePrice — behaviour of each part", () => {
  it("prices metal from NET weight × the purity's rate; stone weight earns no metal value", () => {
    const withStones = calculatePrice(necklace({ grossWeight: 12, stoneWeight: 2, makingRule: undefined, wastageRule: undefined, stoneValue: 0 }));
    const plain = calculatePrice(necklace({ grossWeight: 10, stoneWeight: 0, makingRule: undefined, wastageRule: undefined, stoneValue: 0 }));
    expect(withStones.metalValue).toBe(plain.metalValue);
  });

  it("percentage making is a percentage of metal value only — wastage and stones don't enlarge it", () => {
    const a = calculatePrice(necklace({ wastageRule: undefined, stoneValue: 0 }));
    const b = calculatePrice(necklace({ wastageRule: { type: "PERCENTAGE", value: 5 }, stoneValue: 999_999 }));
    expect(b.makingCharges).toBe(a.makingCharges);
  });

  it("FIXED making ignores the piece count; PER_PIECE multiplies by it", () => {
    const fixed = calculatePrice(necklace({ pieces: 4, makingRule: { type: "FIXED", value: 100_000 } }));
    const perPiece = calculatePrice(necklace({ pieces: 4, makingRule: { type: "PER_PIECE", value: 100_000 } }));
    expect(fixed.makingCharges).toBe(100_000);
    expect(perPiece.makingCharges).toBe(400_000);
  });

  it("no rules at all means no making, no wastage, no discount", () => {
    const b = calculatePrice(necklace({ makingRule: undefined, wastageRule: undefined, discountRule: undefined, stoneValue: 0 }));
    expect([b.makingCharges, b.wastageValue, b.wastageWeight, b.discount]).toEqual([0, 0, 0, 0]);
    expect(b.subtotal).toBe(b.metalValue);
  });

  it("a discount off the making charges only never touches the metal", () => {
    const b = calculatePrice(necklace({ discountRule: { type: "PERCENTAGE", value: 50, appliesTo: "MAKING_CHARGES" } }));
    expect(b.discount).toBe(916_500);
    expect(b.discount).toBe(b.makingCharges / 2);
  });

  it("splits GST into CGST+SGST within a state and IGST across states, comparing states case-insensitively", () => {
    const intra = calculatePrice(necklace({ sellerState: "Maharashtra", buyerState: "  MAHARASHTRA " }));
    const inter = calculatePrice(necklace({ sellerState: "Maharashtra", buyerState: "Gujarat" }));
    expect(intra.taxes).toMatchObject({ supplyType: "INTRA_STATE", igst: 0 });
    expect(intra.taxes.cgst).toBeGreaterThan(0);
    expect(inter.taxes).toMatchObject({ supplyType: "INTER_STATE", cgst: 0, sgst: 0 });
    expect(inter.taxes.igst).toBeGreaterThan(0);
  });

  it("takes every tax rate from the rule — a different rule gives a different tax with the same code", () => {
    const rule = { hsnCode: "7113", intraState: { cgst: 0.125, sgst: 0.125 }, interState: { igst: 0.25 } };
    const b = calculatePrice(necklace({ taxRule: { ...rule, id: "tax-1" } }));
    expect(b.taxes).toMatchObject({ cgstRate: 0.125, sgstRate: 0.125, taxRuleId: "tax-1" });
    expect(b.taxes.cgst).toBe(Math.round(b.taxableValue * 0.00125));
  });

  it("supports zero-rated tax when the rule says 0%", () => {
    const b = calculatePrice(necklace({ taxRule: { hsnCode: "7113", intraState: { cgst: 0, sgst: 0 }, interState: { igst: 0 } } }));
    expect(b.totalTax).toBe(0);
    expect(b.finalAmount).toBe(b.taxableValue);
  });

  it("reports margin against taxable value, and warns when a sale is below cost", () => {
    const profit = calculatePrice(necklace({ cost: 10_000_000 }));
    expect(profit.grossMargin).toBe(profit.taxableValue - 10_000_000);
    expect(profit.warnings).toEqual([]);
    const loss = calculatePrice(necklace({ cost: 99_000_000 }));
    expect(loss.grossMargin).toBeLessThan(0);
    expect(loss.warnings.map((w) => w.code)).toEqual(["BELOW_COST"]);
  });

  it("leaves cost, margin and margin % null (not zero) when no cost is known", () => {
    const b = calculatePrice(necklace());
    expect([b.estimatedCost, b.grossMargin, b.marginPercentage]).toEqual([null, null, null]);
  });

  it("accepts a supplied net or fine weight only when it agrees with the derived one", () => {
    expect(() => calculatePrice(necklace({ netWeight: 23.5, fineWeight: 21.526 }))).not.toThrow();
    expect(() => calculatePrice(necklace({ fineWeight: 21.527 }))).not.toThrow(); // 1 mg of rounding slack
  });

  it("records the terms it applied and marks them as direct input", () => {
    const b = calculatePrice(necklace());
    expect(b.rules.making).toEqual({ terms: { type: "PERCENTAGE", value: 12 }, source: { kind: "INPUT" } });
    expect(b.rules.discount).toBeNull();
  });
});

describe("calculatePrice — refuses unusable input instead of guessing", () => {
  it.each([
    ["negative stone weight", { stoneWeight: -0.1 }, "INVALID_WEIGHT"],
    ["zero gross weight", { grossWeight: 0, stoneWeight: 0 }, "INVALID_WEIGHT"],
    ["stone weight equal to gross weight (no metal left)", { grossWeight: 5, stoneWeight: 5 }, "INVALID_WEIGHT"],
    ["stone heavier than the piece", { grossWeight: 5, stoneWeight: 6 }, "INVALID_WEIGHT"],
    ["an implausibly heavy piece", { grossWeight: 2_000_000, stoneWeight: 0 }, "INVALID_WEIGHT"],
    ["a weight finer than a milligram", { grossWeight: 5.0001 }, "INVALID_INPUT"],
    ["NaN weight", { grossWeight: Number.NaN }, "INVALID_INPUT"],
    ["a net weight that is not gross − stone", { netWeight: 24 }, "WEIGHT_MISMATCH"],
    ["a fine weight far from net × fineness", { fineWeight: 23.5 }, "WEIGHT_MISMATCH"],
    ["zero pieces", { pieces: 0 }, "INVALID_INPUT"],
    ["fractional pieces", { pieces: 1.5 }, "INVALID_INPUT"],
    ["a zero metal rate", { metalRate: { metalId: GOLD, purity: P22K, ratePerGram: 0 } }, "INVALID_RATE"],
    ["a fractional-paise rate", { metalRate: { metalId: GOLD, purity: P22K, ratePerGram: 6500.5 } }, "INVALID_INPUT"],
    ["a rate for a different metal", { metalRate: { metalId: SILVER, purity: P22K, ratePerGram: 650_000 } }, "METAL_MISMATCH"],
    ["fineness above 1", { purity: { code: "22K", fineness: 1.2 } }, "INVALID_INPUT"],
    ["fineness of zero", { purity: { code: "22K", fineness: 0 } }, "INVALID_INPUT"],
    ["negative stone value", { stoneValue: -1 }, "INVALID_INPUT"],
    ["fractional-paise stone value", { stoneValue: 10.5 }, "INVALID_INPUT"],
    ["negative cost", { cost: -5 }, "INVALID_INPUT"],
    ["a making percentage over 100", { makingRule: { type: "PERCENTAGE", value: 101 } }, "INVALID_INPUT"],
    ["negative per-gram making", { makingRule: { type: "PER_GRAM", value: -1 } }, "INVALID_INPUT"],
    ["fractional-paise fixed making", { makingRule: { type: "FIXED", value: 100.5 } }, "INVALID_INPUT"],
    ["an unknown making type", { makingRule: { type: "PER_CARAT", value: 1 } as never }, "INVALID_RULE"],
    ["a wastage percentage over 100", { wastageRule: { type: "PERCENTAGE", value: 150 } }, "INVALID_INPUT"],
    ["a fixed wastage weight above the net weight", { wastageRule: { type: "FIXED_WEIGHT", value: 30 } }, "INVALID_RULE"],
    ["an unknown wastage type", { wastageRule: { type: "PER_GRAM", value: 1 } as never }, "INVALID_RULE"],
    ["a discount percentage over 100", { discountRule: { type: "PERCENTAGE", value: 100.5 } }, "INVALID_INPUT"],
    ["a flat discount larger than the subtotal", { discountRule: { type: "FLAT", value: 999_999_999 } }, "DISCOUNT_EXCEEDS_BASE"],
    ["a flat making-only discount larger than the making charge", { discountRule: { type: "FLAT", value: 5_000_000, appliesTo: "MAKING_CHARGES" } }, "DISCOUNT_EXCEEDS_BASE"],
    ["a missing buyer state", { buyerState: " " }, "INVALID_INPUT"],
    ["a missing seller state", { sellerState: "" }, "INVALID_INPUT"],
    ["a tax rate above 100", { taxRule: { ...GST_7113, interState: { igst: 130 }, intraState: { cgst: 150, sgst: 1 } } }, "INVALID_INPUT"],
  ] as [string, Partial<PriceCalculationInput>, string][])("%s", (_name, overrides, expected) => {
    expect(code(() => calculatePrice(necklace(overrides)))).toBe(expected);
  });

  it("names the offending field on the error", () => {
    try {
      calculatePrice(necklace({ grossWeight: 5, stoneWeight: 6 }));
      expect.unreachable();
    } catch (error) {
      expect((error as PricingError).field).toBe("stoneWeight");
    }
  });
});

describe("calculatePrice — determinism", () => {
  it("returns the identical breakdown for the same input, every time", () => {
    const input = necklace({ cost: 15_800_000, discountRule: { type: "PERCENTAGE", value: 3.25 } });
    const first = calculatePrice(input);
    for (let i = 0; i < 50; i++) expect(calculatePrice(input)).toEqual(first);
  });

  it("never mutates its input (a frozen input works)", () => {
    expect(() => calculatePrice(deepFreeze(necklace({ cost: 1, discountRule: { type: "FLAT", value: 10 } })))).not.toThrow();
  });

  it("does not depend on the clock", () => {
    const realNow = Date.now;
    Date.now = () => {
      throw new Error("the engine read the clock");
    };
    try {
      expect(() => calculatePrice(necklace())).not.toThrow();
    } finally {
      Date.now = realNow;
    }
  });

  it("is not thrown off by float noise in inputs (0.1 + 0.2 grams)", () => {
    const noisy = calculatePrice(necklace({ grossWeight: 0.1 + 0.2 + 5, stoneWeight: 0, makingRule: { type: "PERCENTAGE", value: 0.1 + 0.2 } }));
    const clean = calculatePrice(necklace({ grossWeight: 5.3, stoneWeight: 0, makingRule: { type: "PERCENTAGE", value: 0.3 } }));
    // Every amount is identical; only the echoed rule terms differ (they are reported exactly as given).
    const amounts = ({ rules: _rules, ...rest }: PriceBreakdown) => rest;
    expect(amounts(noisy)).toEqual(amounts(clean));
  });

  it("rounds a half-paisa away from zero, exactly, wherever it appears", () => {
    // 0.5% of ₹1,001.00 (100,100 paise) is 500.5 paise → 501; 0.5% of 100,300 is 501.5 → 502.
    const rate = (paise: number) => calculatePrice(necklace({ grossWeight: 1, stoneWeight: 0, purity: P999, metalRate: { metalId: GOLD, purity: P999, ratePerGram: paise }, stoneValue: 0, makingRule: { type: "PERCENTAGE", value: 0.5 }, wastageRule: undefined })).makingCharges;
    expect(rate(100_100)).toBe(501);
    expect(rate(100_300)).toBe(502);
  });
});

describe("calculatePrice — the parts always add up (seeded random pieces)", () => {
  it("holds for 500 random, valid lines", () => {
    const random = seeded(20260920);
    const int = (lo: number, hi: number) => lo + Math.floor(random() * (hi - lo + 1));
    const pick = <T,>(items: readonly T[]) => items[int(0, items.length - 1)]!;
    const purities = [P24K, P22K, P18K, P925, { code: "14K", fineness: 0.585 }];
    for (let i = 0; i < 500; i++) {
      const purity = pick(purities);
      const grossMg = int(500, 400_000);
      const stoneMg = pick([0, int(0, grossMg - 1)]);
      const input = necklace({
        purity,
        grossWeight: grossMg / 1000,
        stoneWeight: stoneMg / 1000,
        pieces: pick([1, 1, 3, 10]),
        metalRate: { metalId: GOLD, purity: pick([purity, P24K]), ratePerGram: int(1_000, 900_000) },
        stoneValue: pick([0, int(1, 5_000_000)]),
        makingRule: pick([undefined, { type: "PERCENTAGE", value: int(0, 3000) / 100 }, { type: "PER_GRAM", value: int(0, 100_000) }, { type: "FIXED", value: int(0, 500_000) }, { type: "PER_PIECE", value: int(0, 100_000) }] as const),
        wastageRule: pick([undefined, { type: "NONE" }, { type: "PERCENTAGE", value: int(0, 1500) / 100 }, { type: "FIXED_WEIGHT", value: int(0, grossMg - stoneMg) / 1000 }] as const),
        discountRule: pick([undefined, { type: "PERCENTAGE", value: int(0, 10_000) / 100 }] as const),
        buyerState: pick(["Maharashtra", "Kerala"]),
      });
      const b = calculatePrice(input);
      expectAddsUp(b);
      expect(calculatePrice(input)).toEqual(b);
    }
  });
});
