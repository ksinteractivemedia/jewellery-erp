import { describe, expect, it } from "vitest";
import { createPricingRuleSchema } from "@jewellery/validation";
import { ConflictError, DomainValidationError } from "../../shared/errors";
import { assertNoAmbiguousPricingRule, assertValidMergedPricingRule } from "./pricing-rule.validation";
import type { PricingRule } from "@jewellery/types";

const BASE = {
  name: "Standard making charge",
  channel: "BOTH" as const,
  makingChargeType: "PERCENTAGE" as const,
  makingChargeValue: 12,
  priority: 0,
  validFrom: new Date("2026-01-01"),
};

function rule(overrides: Partial<PricingRule> = {}): PricingRule {
  return {
    id: overrides.id ?? "000000000000000000000001",
    name: "rule",
    channel: "BOTH",
    priority: 0,
    validFrom: new Date("2026-01-01"),
    isActive: true,
    makingChargeType: "PERCENTAGE",
    makingChargeValue: 10,
    ...overrides,
  } as PricingRule;
}

describe("createPricingRuleSchema (shape + cross-field business rules)", () => {
  it("accepts a rule with only a making charge set", () => {
    expect(() => createPricingRuleSchema.parse(BASE)).not.toThrow();
  });

  it("rejects a rule with none of makingCharge/wastage/discount set", () => {
    const { makingChargeType, makingChargeValue, ...rest } = BASE;
    expect(() => createPricingRuleSchema.parse(rest)).toThrow();
  });

  it("rejects makingChargeType without a matching makingChargeValue", () => {
    expect(() => createPricingRuleSchema.parse({ ...BASE, makingChargeValue: undefined })).toThrow();
  });

  it("rejects a PERCENTAGE making charge above 100", () => {
    expect(() => createPricingRuleSchema.parse({ ...BASE, makingChargeValue: 150 })).toThrow();
  });

  it("accepts a PER_GRAM making charge above 100 (not a percentage, no cap)", () => {
    expect(() => createPricingRuleSchema.parse({ ...BASE, makingChargeType: "PER_GRAM", makingChargeValue: 250 })).not.toThrow();
  });

  it("rejects a PERCENTAGE discount above 100", () => {
    expect(() =>
      createPricingRuleSchema.parse({ ...BASE, discount: { type: "PERCENTAGE", value: 120 } })
    ).toThrow();
  });

  it("accepts a FLAT discount above 100 (flat paise, not a percentage)", () => {
    expect(() => createPricingRuleSchema.parse({ ...BASE, discount: { type: "FLAT", value: 5000 } })).not.toThrow();
  });

  it("rejects validTo before validFrom", () => {
    expect(() => createPricingRuleSchema.parse({ ...BASE, validTo: new Date("2025-01-01") })).toThrow();
  });

  it("accepts validTo after validFrom", () => {
    expect(() => createPricingRuleSchema.parse({ ...BASE, validTo: new Date("2027-01-01") })).not.toThrow();
  });
});

describe("assertValidMergedPricingRule", () => {
  it("passes for a valid merged rule", () => {
    expect(() => assertValidMergedPricingRule(BASE)).not.toThrow();
  });

  it("throws when a patch would leave the rule with no calculation dimension", () => {
    const merged = { ...BASE, makingChargeType: undefined, makingChargeValue: undefined };
    expect(() => assertValidMergedPricingRule(merged)).toThrow(DomainValidationError);
  });
});

describe("createPricingRuleSchema — making, wastage and discount types", () => {
  it.each(["PERCENTAGE", "PER_GRAM", "FIXED", "PER_PIECE"] as const)("accepts a %s making charge", (type) => {
    expect(() => createPricingRuleSchema.parse({ ...BASE, makingChargeType: type, makingChargeValue: 10 })).not.toThrow();
  });

  it("rejects the old FLAT making type — it is FIXED now", () => {
    expect(() => createPricingRuleSchema.parse({ ...BASE, makingChargeType: "FLAT", makingChargeValue: 10 })).toThrow();
  });

  it.each(["PER_GRAM", "FIXED", "PER_PIECE"] as const)("rejects a fractional-paise %s making charge", (type) => {
    expect(() => createPricingRuleSchema.parse({ ...BASE, makingChargeType: type, makingChargeValue: 10.5 })).toThrow();
  });

  it("accepts wastage as a percentage, a fixed weight in grams, or NONE", () => {
    expect(() => createPricingRuleSchema.parse({ ...BASE, wastageType: "PERCENTAGE", wastageValue: 2.5 })).not.toThrow();
    expect(() => createPricingRuleSchema.parse({ ...BASE, wastageType: "FIXED_WEIGHT", wastageValue: 0.15 })).not.toThrow();
    expect(() => createPricingRuleSchema.parse({ ...BASE, wastageType: "NONE" })).not.toThrow();
  });

  it("accepts a rule whose only job is to switch wastage off", () => {
    const { makingChargeType, makingChargeValue, ...rest } = BASE;
    expect(() => createPricingRuleSchema.parse({ ...rest, customerId: "0000000000000000000000f1", wastageType: "NONE" })).not.toThrow();
  });

  it("rejects wastage NONE with a value, and a wastage type other than NONE without one", () => {
    expect(() => createPricingRuleSchema.parse({ ...BASE, wastageType: "NONE", wastageValue: 2 })).toThrow();
    expect(() => createPricingRuleSchema.parse({ ...BASE, wastageType: "PERCENTAGE" })).toThrow();
  });

  it("rejects a wastage weight finer than a milligram, and the old PER_GRAM wastage type", () => {
    expect(() => createPricingRuleSchema.parse({ ...BASE, wastageType: "FIXED_WEIGHT", wastageValue: 0.1234 })).toThrow();
    expect(() => createPricingRuleSchema.parse({ ...BASE, wastageType: "PER_GRAM", wastageValue: 1 })).toThrow();
  });

  it("accepts a discount that applies to the making charges only", () => {
    expect(() => createPricingRuleSchema.parse({ ...BASE, discount: { type: "PERCENTAGE", value: 50, appliesTo: "MAKING_CHARGES" } })).not.toThrow();
    expect(() => createPricingRuleSchema.parse({ ...BASE, discount: { type: "PERCENTAGE", value: 50, appliesTo: "STONES" } })).toThrow();
  });

  it("accepts a customer-specific rule", () => {
    expect(() => createPricingRuleSchema.parse({ ...BASE, customerId: "0000000000000000000000f1" })).not.toThrow();
    expect(() => createPricingRuleSchema.parse({ ...BASE, customerId: "not-an-id" })).toThrow();
  });
});

describe("assertNoAmbiguousPricingRule", () => {
  it("passes when nothing else could apply equally", () => {
    expect(() => assertNoAmbiguousPricingRule(rule({ id: "2", priority: 5 }), [rule({ id: "1", priority: 0 })])).not.toThrow();
  });

  it("refuses a rule that ties with a stored one, naming the rival", () => {
    expect(() => assertNoAmbiguousPricingRule(rule({ id: "2", name: "New rule" }), [rule({ id: "1", name: "Existing rule" })])).toThrow(ConflictError);
    expect(() => assertNoAmbiguousPricingRule(rule({ id: "2" }), [rule({ id: "1", name: "Existing rule" })])).toThrow(/Existing rule/);
  });

  it("ignores a stored rule that is out of the way (different metal)", () => {
    expect(() => assertNoAmbiguousPricingRule(rule({ id: "2", metalId: "m1" }), [rule({ id: "1", metalId: "m2" })])).not.toThrow();
  });

  it("does not compare a rule with itself when it is being updated", () => {
    const stored = rule({ id: "1" });
    expect(() => assertNoAmbiguousPricingRule(stored, [stored])).not.toThrow();
  });

  it("does not blame the candidate for two OTHER rules that already clash", () => {
    expect(() => assertNoAmbiguousPricingRule(rule({ id: "3", priority: 9 }), [rule({ id: "1" }), rule({ id: "2" })])).not.toThrow();
  });
});
