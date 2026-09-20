import { describe, expect, it } from "vitest";
import { createPricingRuleSchema } from "@jewellery/validation";
import { DomainValidationError } from "../../shared/errors";
import { assertValidMergedPricingRule, isRuleEffective, resolveApplicableRule } from "./pricing-rule.validation";
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

  it("accepts a FLAT discount above 100 (a flat rupee amount, not a percentage)", () => {
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

describe("isRuleEffective", () => {
  it("is false before validFrom", () => {
    const r = rule({ validFrom: new Date("2026-06-01") });
    expect(isRuleEffective(r, new Date("2026-01-01"))).toBe(false);
  });

  it("is false after validTo", () => {
    const r = rule({ validFrom: new Date("2026-01-01"), validTo: new Date("2026-06-01") });
    expect(isRuleEffective(r, new Date("2026-07-01"))).toBe(false);
  });

  it("is true within the validity window", () => {
    const r = rule({ validFrom: new Date("2026-01-01"), validTo: new Date("2026-12-31") });
    expect(isRuleEffective(r, new Date("2026-06-01"))).toBe(true);
  });

  it("is false when isActive is false, even within the window", () => {
    const r = rule({ isActive: false, validFrom: new Date("2026-01-01") });
    expect(isRuleEffective(r, new Date("2026-06-01"))).toBe(false);
  });

  it("has no upper bound when validTo is unset", () => {
    const r = rule({ validFrom: new Date("2026-01-01"), validTo: undefined });
    expect(isRuleEffective(r, new Date("2099-01-01"))).toBe(true);
  });
});

describe("resolveApplicableRule", () => {
  const asOf = new Date("2026-06-01");

  it("returns undefined when no rule is effective", () => {
    const r = rule({ validFrom: new Date("2027-01-01") });
    expect(resolveApplicableRule([r], asOf)).toBeUndefined();
  });

  it("picks the highest-priority effective rule", () => {
    const low = rule({ id: "1", priority: 1 });
    const high = rule({ id: "2", priority: 10 });
    expect(resolveApplicableRule([low, high], asOf)?.id).toBe("2");
  });

  it("breaks a priority tie by specificity (more scoping fields wins)", () => {
    const general = rule({ id: "1", priority: 5 });
    const specific = rule({ id: "2", priority: 5, metalId: "m1", categoryId: "c1", customerGroupId: "g1" });
    expect(resolveApplicableRule([general, specific], asOf)?.id).toBe("2");
  });

  it("ignores an inactive or out-of-window rule even if it has higher priority", () => {
    const active = rule({ id: "1", priority: 1 });
    const inactiveButHigherPriority = rule({ id: "2", priority: 99, isActive: false });
    expect(resolveApplicableRule([active, inactiveButHigherPriority], asOf)?.id).toBe("1");
  });
});
