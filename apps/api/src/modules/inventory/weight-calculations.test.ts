import { describe, expect, it } from "vitest";
import { DomainValidationError } from "../../shared/errors";
import { calculateFineWeight, calculateNetWeight, deriveWeights, roundWeight } from "./weight-calculations";

describe("roundWeight", () => {
  it("rounds to 3 decimal places", () => {
    expect(roundWeight(18.42019)).toBe(18.42);
    expect(roundWeight(1.0005)).toBe(1.001);
    expect(roundWeight(0.0001)).toBe(0);
  });
});

describe("calculateNetWeight", () => {
  it("subtracts stone weight from gross weight", () => {
    expect(calculateNetWeight(38.6, 4.5)).toBe(34.1);
  });

  it("returns the gross weight unchanged when there are no stones", () => {
    expect(calculateNetWeight(18.42, 0)).toBe(18.42);
  });

  it("rounds the result to 3 decimals", () => {
    expect(calculateNetWeight(10.1234, 0.0004)).toBe(10.123);
  });

  it("rejects a stoneWeight greater than grossWeight", () => {
    expect(() => calculateNetWeight(10, 10.5)).toThrow(DomainValidationError);
  });

  it("rejects negative inputs", () => {
    expect(() => calculateNetWeight(-1, 0)).toThrow(DomainValidationError);
    expect(() => calculateNetWeight(10, -1)).toThrow(DomainValidationError);
  });
});

describe("calculateFineWeight", () => {
  it("multiplies net weight by fineness for 22K gold (0.916), rounded to 3 decimals", () => {
    // 34.1 * 0.916 = 31.2356 -> rounds to 31.236
    expect(calculateFineWeight(34.1, 0.916)).toBe(31.236);
  });

  it("multiplies net weight by fineness for 18K gold (0.75)", () => {
    expect(calculateFineWeight(20, 0.75)).toBe(15);
  });

  it("returns the full net weight for 24K / 999 fine (fineness 0.999)", () => {
    expect(calculateFineWeight(10, 0.999)).toBe(9.99);
  });

  it("rejects fineness of 0 or below", () => {
    expect(() => calculateFineWeight(10, 0)).toThrow(DomainValidationError);
    expect(() => calculateFineWeight(10, -0.1)).toThrow(DomainValidationError);
  });

  it("rejects fineness above 1", () => {
    expect(() => calculateFineWeight(10, 1.01)).toThrow(DomainValidationError);
  });

  it("accepts fineness of exactly 1 (pure metal)", () => {
    expect(calculateFineWeight(10, 1)).toBe(10);
  });

  it("rejects negative net weight", () => {
    expect(() => calculateFineWeight(-5, 0.916)).toThrow(DomainValidationError);
  });
});

describe("deriveWeights", () => {
  it("computes net and fine weight together for a hallmarked 22K piece", () => {
    // Zaira Diamond Necklace fixture from the design-system showcase: gross 38.6g, stone 4.5g, 18K (0.75 fine)
    expect(deriveWeights(38.6, 4.5, 0.75)).toEqual({ netWeight: 34.1, fineWeight: 25.575 });
  });

  it("computes correctly for a stone-free bangle", () => {
    // 18.42 * 0.916 = 16.87272 -> rounds to 16.873
    expect(deriveWeights(18.42, 0, 0.916)).toEqual({ netWeight: 18.42, fineWeight: 16.873 });
  });
});
