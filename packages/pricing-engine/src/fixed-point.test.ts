import { describe, expect, it } from "vitest";
import { PricingError } from "./errors";
import { divRound, toFineness, toNumber, toPaise, toPercent, toScaled } from "./fixed-point";
import { valueOfMetal } from "./metal";

const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (error) {
    return error instanceof PricingError ? error.code : String(error);
  }
  return "no error";
};

describe("divRound — half away from zero, exactly", () => {
  it.each([
    [10n, 4n, 3n], // 2.5 → 3
    [9n, 4n, 2n], // 2.25 → 2
    [11n, 4n, 3n], // 2.75 → 3
    [1n, 2n, 1n], // 0.5 → 1
    [0n, 7n, 0n],
    [12n, 4n, 3n], // exact
    [-10n, 4n, -3n], // -2.5 → -3 (away from zero)
    [-9n, 4n, -2n],
    [-1n, 2n, -1n],
    [10n ** 30n + 1n, 10n ** 30n, 1n], // far beyond Number's range
  ])("%s ÷ %s = %s", (n, d, expected) => {
    expect(divRound(n, d)).toBe(expected);
  });
});

describe("toScaled", () => {
  it("accepts values on the grid and tolerates float noise", () => {
    expect(toScaled(23.5, 3, "w")).toBe(23_500n);
    expect(toScaled(0.1 + 0.2, 6, "w")).toBe(300_000n);
    expect(toScaled(1.005, 3, "w")).toBe(1_005n);
    expect(toScaled(0, 3, "w")).toBe(0n);
  });

  it("refuses precision beyond the grid rather than rounding it away", () => {
    expect(code(() => toScaled(1.0005, 3, "w"))).toBe("INVALID_INPUT");
    expect(code(() => toScaled(0.0000005, 6, "w"))).toBe("INVALID_INPUT");
  });

  it("refuses non-numbers and non-finite numbers", () => {
    for (const bad of [Number.NaN, Infinity, -Infinity, "5" as unknown as number, undefined as unknown as number, null as unknown as number]) expect(code(() => toScaled(bad, 3, "w"))).toBe("INVALID_INPUT");
  });

  it("refuses a number too large to hold exactly", () => {
    expect(code(() => toScaled(1e300, 3, "w"))).toBe("AMOUNT_TOO_LARGE");
  });
});

describe("toPaise / toPercent / toFineness", () => {
  it("toPaise takes whole, non-negative, safe integers only", () => {
    expect(toPaise(0, "x")).toBe(0n);
    expect(toPaise(123_456_789, "x")).toBe(123_456_789n);
    for (const bad of [-1, 1.5, Number.NaN, 2 ** 53, "1" as unknown as number]) expect(code(() => toPaise(bad, "x"))).toBe("INVALID_INPUT");
  });

  it("toPercent takes 0–100 with at most 6 decimals", () => {
    expect(toPercent(0, "p")).toBe(0n);
    expect(toPercent(12.5, "p")).toBe(12_500_000n);
    expect(toPercent(100, "p")).toBe(100_000_000n);
    for (const bad of [-0.000001, 100.000001, 1.0000001]) expect(code(() => toPercent(bad, "p"))).toBe("INVALID_INPUT");
  });

  it("toFineness takes (0, 1]", () => {
    expect(toFineness(0.916, "f")).toBe(916_000n);
    expect(toFineness(1, "f")).toBe(1_000_000n);
    for (const bad of [0, -0.5, 1.000001, Number.NaN]) expect(code(() => toFineness(bad, "f"))).toBe("INVALID_INPUT");
  });

  it("toNumber refuses what Number cannot represent", () => {
    expect(toNumber(9_007_199_254_740_991n, "x")).toBe(9_007_199_254_740_991);
    expect(code(() => toNumber(9_007_199_254_740_992n, "x"))).toBe("AMOUNT_TOO_LARGE");
  });
});

describe("valueOfMetal — the one metal-value formula (pricing and stock valuation both use it)", () => {
  it("values fine (pure) metal at rate ÷ quoted fineness", () => {
    // 9.618 g of pure gold; the ₹6,500 rate is for 999 gold → ₹6,506.51 per gram of pure metal → ₹62,579.58.
    expect(valueOfMetal({ weight: 9.618, fineness: 1, ratePerGram: 650_000, quotedFineness: 0.999 })).toBe(6_257_958);
  });

  it("values alloyed metal through its own fineness", () => {
    expect(valueOfMetal({ weight: 10, fineness: 0.916, ratePerGram: 710_000, quotedFineness: 0.999 })).toBe(6_510_110);
  });

  it("is exact where floating point is not: 12.5% of a rate lands on the half paisa and rounds up", () => {
    expect(valueOfMetal({ weight: 0.001, fineness: 1, ratePerGram: 500, quotedFineness: 1 })).toBe(1); // 0.5 paise → 1
  });

  it("refuses a negative weight and out-of-range fineness", () => {
    expect(code(() => valueOfMetal({ weight: -1, fineness: 1, ratePerGram: 1, quotedFineness: 1 }))).toBe("INVALID_WEIGHT");
    expect(code(() => valueOfMetal({ weight: 1, fineness: 1.1, ratePerGram: 1, quotedFineness: 1 }))).toBe("INVALID_INPUT");
    expect(code(() => valueOfMetal({ weight: 1, fineness: 1, ratePerGram: 1, quotedFineness: 0 }))).toBe("INVALID_INPUT");
  });
});
