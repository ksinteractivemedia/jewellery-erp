import { describe, expect, it } from "vitest";
import { buildValuation, metalMarketValue } from "./valuation";

describe("metal market value", () => {
  it("values fine weight at the pure-metal rate implied by the quoted purity", () => {
    // 24K quoted at ₹6,500.00/g (650000 paise), fineness 0.999. A piece with 9.16 g fine metal:
    // pure metal = 650000 / 0.999 per gram → 9.16 × that.
    expect(metalMarketValue(9.16, 650_000, 0.999)).toBe(Math.round((9.16 * 650_000) / 0.999));
  });

  it("is exact when the quote is for the item's own purity: net weight × rate", () => {
    // 22K at 5,950/g quoted for 22K itself (fineness .916); 10 g net → fine 9.16 → value = 10 × 595000
    expect(metalMarketValue(9.16, 595_000, 0.916)).toBe(5_950_000);
  });

  it("returns whole paise and zero for zero weight", () => {
    expect(Number.isInteger(metalMarketValue(3.333, 123_457, 0.916))).toBe(true);
    expect(metalMarketValue(0, 650_000, 0.999)).toBe(0);
  });

  it("refuses an impossible fineness", () => {
    expect(() => metalMarketValue(1, 100, 0)).toThrow(RangeError);
    expect(() => metalMarketValue(1, 100, 1.2)).toThrow(RangeError);
  });

  it("builds a valuation with cost only, and an explanatory note, when no rate exists", () => {
    const v = buildValuation({ cost: 50_000, fineWeight: 9.16, purity: "22K" }, null, null);
    expect(v).toEqual({ costPaise: 50_000, metalValueNote: "No current rate on file for this metal" });
  });

  it("notes when the value was derived from a different purity's quote", () => {
    const v = buildValuation({ cost: 1, fineWeight: 9.16, purity: "22K" }, { ratePerGram: 650_000, purity: "24K", effectiveFrom: new Date("2026-09-20") }, 0.999);
    expect(v.metalValuePaise).toBe(metalMarketValue(9.16, 650_000, 0.999));
    expect(v.metalValueNote).toBe("Derived from the 24K rate");
    expect(v.ratePurity).toBe("24K");
  });
});
