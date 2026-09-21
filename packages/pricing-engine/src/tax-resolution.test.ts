import { describe, expect, it } from "vitest";
import { PricingError } from "./errors";
import { taxRule } from "./fixtures";
import { resolveTaxRule } from "./tax-resolution";

const at = (iso: string) => new Date(iso);
const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (error) {
    return error instanceof PricingError ? error.code : String(error);
  }
  return "no error";
};

describe("resolveTaxRule", () => {
  it("finds the active rule for the HSN code", () => {
    const rules = [taxRule(1), taxRule(2, { hsnCode: "7106" })];
    expect(resolveTaxRule(rules, { hsnCode: "7113", asOf: at("2026-09-20") }).id).toBe(taxRule(1).id);
    expect(resolveTaxRule(rules, { hsnCode: " 7106 ", asOf: at("2026-09-20") }).id).toBe(taxRule(2).id);
  });

  it("uses the rate in force on the date — a rate change never rewrites an earlier sale", () => {
    const rules = [
      taxRule(1, { validTo: at("2026-07-01"), interState: { igst: 3 } }),
      taxRule(2, { validFrom: at("2026-07-01"), intraState: { cgst: 2, sgst: 2 }, interState: { igst: 4 } }),
    ];
    expect(resolveTaxRule(rules, { hsnCode: "7113", asOf: at("2026-06-30T23:59:59Z") }).interState.igst).toBe(3);
    expect(resolveTaxRule(rules, { hsnCode: "7113", asOf: at("2026-07-01T00:00:00Z") }).interState.igst).toBe(4);
  });

  it("prefers the most recently started of overlapping rules", () => {
    const rules = [taxRule(1, { validFrom: at("2026-01-01") }), taxRule(2, { validFrom: at("2026-05-01"), interState: { igst: 5 } })];
    expect(resolveTaxRule(rules, { hsnCode: "7113", asOf: at("2026-09-20") }).id).toBe(taxRule(2).id);
  });

  it("is independent of the order rules are supplied in", () => {
    const rules = [taxRule(1, { validFrom: at("2026-01-01") }), taxRule(2, { validFrom: at("2026-05-01") }), taxRule(3, { validFrom: at("2026-03-01") })];
    for (const order of [rules, [...rules].reverse(), [rules[1]!, rules[2]!, rules[0]!]]) expect(resolveTaxRule(order, { hsnCode: "7113", asOf: at("2026-09-20") }).id).toBe(taxRule(2).id);
  });

  it("refuses when no rule applies: unknown HSN, not yet started, expired, or inactive", () => {
    expect(code(() => resolveTaxRule([taxRule(1)], { hsnCode: "9999", asOf: at("2026-09-20") }))).toBe("NO_TAX_RULE");
    expect(code(() => resolveTaxRule([taxRule(1, { validFrom: at("2027-01-01") })], { hsnCode: "7113", asOf: at("2026-09-20") }))).toBe("NO_TAX_RULE");
    expect(code(() => resolveTaxRule([taxRule(1, { validTo: at("2026-09-20") })], { hsnCode: "7113", asOf: at("2026-09-20") }))).toBe("NO_TAX_RULE");
    expect(code(() => resolveTaxRule([taxRule(1, { isActive: false })], { hsnCode: "7113", asOf: at("2026-09-20") }))).toBe("NO_TAX_RULE");
    expect(code(() => resolveTaxRule([], { hsnCode: "7113", asOf: at("2026-09-20") }))).toBe("NO_TAX_RULE");
  });

  it("refuses to guess between two rules that start on the same instant", () => {
    const rules = [taxRule(1), taxRule(2, { interState: { igst: 5 } })];
    expect(code(() => resolveTaxRule(rules, { hsnCode: "7113", asOf: at("2026-09-20") }))).toBe("AMBIGUOUS_TAX_RULE");
    expect(code(() => resolveTaxRule([...rules].reverse(), { hsnCode: "7113", asOf: at("2026-09-20") }))).toBe("AMBIGUOUS_TAX_RULE");
  });

  it("rejects an invalid date", () => {
    expect(code(() => resolveTaxRule([taxRule(1)], { hsnCode: "7113", asOf: new Date("x") }))).toBe("INVALID_INPUT");
  });
});
