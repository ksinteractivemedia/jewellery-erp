import type { PriceCalculationInput, PricingContext, PricingRule, PurityRef, TaxRule, TaxTerms } from "@jewellery/types";

/** Test data only — never imported by production code (CLAUDE.md rule 7). */
export const GOLD = "000000000000000000000001";
export const SILVER = "000000000000000000000002";

export const P24K: PurityRef = { code: "24K", fineness: 0.999 };
export const P22K: PurityRef = { code: "22K", fineness: 0.916 };
export const P18K: PurityRef = { code: "18K", fineness: 0.75 };
export const P925: PurityRef = { code: "925", fineness: 0.925 };
export const P999: PurityRef = { code: "999", fineness: 0.999 };

/** HSN 7113, GST 3%: 1.5% + 1.5% inside a state, 3% across states. The numbers are test data, not a default. */
export const GST_7113: TaxTerms = { hsnCode: "7113", intraState: { cgst: 1.5, sgst: 1.5 }, interState: { igst: 3 } };

export const NOW = new Date("2026-09-20T00:00:00.000Z");

/** ₹6,500/g for 22K gold — the 22K necklace of scenario S1 in tests/test-plan.md. */
export function necklace(overrides: Partial<PriceCalculationInput> = {}): PriceCalculationInput {
  return {
    metalId: GOLD,
    purity: P22K,
    grossWeight: 25,
    stoneWeight: 1.5,
    metalRate: { metalId: GOLD, purity: P22K, ratePerGram: 650_000 },
    stoneValue: 450_000,
    makingRule: { type: "PERCENTAGE", value: 12 },
    wastageRule: { type: "PERCENTAGE", value: 2 },
    taxRule: GST_7113,
    sellerState: "Maharashtra",
    buyerState: "Maharashtra",
    ...overrides,
  };
}

export function rule(id: number, overrides: Partial<PricingRule> = {}): PricingRule {
  return {
    id: String(id).padStart(24, "0"),
    name: `rule ${id}`,
    channel: "BOTH",
    priority: 0,
    validFrom: new Date("2026-01-01T00:00:00.000Z"),
    isActive: true,
    makingChargeType: "PERCENTAGE",
    makingChargeValue: 10,
    ...overrides,
  };
}

export function context(overrides: Partial<PricingContext> = {}): PricingContext {
  return { asOf: NOW, channel: "ERP", customerType: "B2C", ...overrides };
}

export function taxRule(id: number, overrides: Partial<TaxRule> = {}): TaxRule {
  return { ...GST_7113, id: String(id).padStart(24, "0"), name: `tax ${id}`, validFrom: new Date("2026-01-01T00:00:00.000Z"), isActive: true, ...overrides };
}

/** Freezes an object graph so any accidental mutation by the engine throws. */
export function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

/** A tiny seeded PRNG (mulberry32), so "random" tests are the same on every run and machine. */
export function seeded(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
