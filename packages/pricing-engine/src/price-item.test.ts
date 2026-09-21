import { describe, expect, it } from "vitest";
import type { PriceItemRequest, PricingContext, PricingRule } from "@jewellery/types";
import { PricingError } from "./errors";
import { GOLD, context, deepFreeze, necklace, rule, seeded } from "./fixtures";
import { priceItem } from "./price-item";

const CAT_BANGLES = "0000000000000000000000c1";
const LIST_WHOLESALE = "0000000000000000000000d1";
const GROUP_DISTRIBUTORS = "0000000000000000000000e1";
const CUSTOMER_ACME = "0000000000000000000000f1";

/** A shop's rule book, from the general to the very specific. Each line's making % is different so a winner reads off the number. */
const RULE_BOOK: PricingRule[] = [
  rule(1, { name: "Gold default", metalId: GOLD, makingChargeValue: 12, wastageType: "PERCENTAGE", wastageValue: 2 }),
  rule(2, { name: "Gold B2B", metalId: GOLD, customerType: "B2B", makingChargeValue: 9, wastageType: "PERCENTAGE", wastageValue: 1 }),
  rule(3, { name: "Bangles", categoryId: CAT_BANGLES, makingChargeType: "PER_GRAM", makingChargeValue: 30_000 }),
  rule(4, { name: "Wholesale price list", priceListId: LIST_WHOLESALE, makingChargeValue: 6 }),
  rule(5, { name: "Distributors", customerGroupId: GROUP_DISTRIBUTORS, customerType: "B2B", makingChargeValue: 5, discount: { type: "PERCENTAGE", value: 2 } }),
  rule(6, { name: "ACME Jewellers", customerId: CUSTOMER_ACME, customerType: "B2B", makingChargeValue: 4, wastageType: "NONE", discount: { type: "FLAT", value: 100_000 } }),
];

/** The same 22K necklace (25 g, 1.5 g stones, ₹6,500/g) sold to different buyers — only the context differs. */
const sale = (contextOverrides: Partial<PricingContext> = {}, rest: Partial<PriceItemRequest> = {}): PriceItemRequest => {
  const { makingRule: _m, wastageRule: _w, discountRule: _d, ...calculation } = necklace();
  return { ...calculation, context: context(contextOverrides), rules: RULE_BOOK, ...rest };
};

describe("priceItem — the same piece, priced for different customers (values from the independent calculator)", () => {
  it("B2C walk-in: the shop default (12% making, 2% wastage)", () => {
    const b = priceItem(sale());
    expect(b).toMatchObject({ metalValue: 15_275_000, wastageValue: 305_500, makingCharges: 1_833_000, discount: 0, taxableValue: 17_863_500, totalTax: 535_906, finalAmount: 18_399_406 });
    expect(b.rules.making?.source).toMatchObject({ kind: "RULE", ruleName: "Gold default", tier: "DEFAULT" });
  });

  it("B2B retailer: the more specific B2B default beats the plain default at the same tier", () => {
    const b = priceItem(sale({ customerType: "B2B" }));
    expect(b).toMatchObject({ wastageValue: 152_750, makingCharges: 1_374_750, subtotal: 17_252_500, taxes: { cgst: 258_788, sgst: 258_788 }, finalAmount: 17_770_076 });
    expect(b.rules.making?.source).toMatchObject({ ruleName: "Gold B2B" });
  });

  it("a bangle: the category rule replaces the making charge, the default still supplies the wastage", () => {
    const b = priceItem(sale({ categoryId: CAT_BANGLES }));
    expect(b).toMatchObject({ makingCharges: 705_000, wastageValue: 305_500, subtotal: 16_735_500, finalAmount: 17_237_566 });
    expect(b.rules.making?.source).toMatchObject({ ruleName: "Bangles", tier: "CATEGORY" });
    expect(b.rules.wastage?.source).toMatchObject({ ruleName: "Gold default" });
  });

  it("a price list outranks the category, and a customer group outranks the price list", () => {
    const both = { categoryId: CAT_BANGLES, priceListId: LIST_WHOLESALE, customerType: "B2B" as const };
    expect(priceItem(sale(both)).rules.making?.source).toMatchObject({ ruleName: "Wholesale price list", tier: "PRICE_LIST" });
    expect(priceItem(sale({ ...both, customerGroupId: GROUP_DISTRIBUTORS })).rules.making?.source).toMatchObject({ ruleName: "Distributors", tier: "CUSTOMER_GROUP" });
  });

  it("a distributor: group making + group discount, wastage from the B2B default", () => {
    const b = priceItem(sale({ customerType: "B2B", customerGroupId: GROUP_DISTRIBUTORS }));
    expect(b).toMatchObject({ makingCharges: 763_750, wastageValue: 152_750, subtotal: 16_641_500, discount: 332_830, taxableValue: 16_308_670, taxes: { cgst: 244_630, sgst: 244_630 }, finalAmount: 16_797_930 });
  });

  it("customer-specific pricing: ACME's own rule wins — 4% making, NO wastage, a flat ₹1,000 off", () => {
    const b = priceItem(sale({ customerType: "B2B", customerGroupId: GROUP_DISTRIBUTORS, priceListId: LIST_WHOLESALE, customerId: CUSTOMER_ACME }));
    expect(b).toMatchObject({ makingCharges: 611_000, wastageWeight: 0, wastageValue: 0, subtotal: 16_336_000, discount: 100_000, taxableValue: 16_236_000, taxes: { cgst: 243_540, sgst: 243_540 }, finalAmount: 16_723_080 });
    expect(b.rules.making?.source).toMatchObject({ ruleName: "ACME Jewellers", tier: "CUSTOMER", shadowedRuleIds: [rule(5).id, rule(4).id, rule(2).id, rule(1).id] });
    expect(b.rules.wastage?.terms).toEqual({ type: "NONE" });
    expect(b.rules.discount?.source).toMatchObject({ ruleName: "ACME Jewellers" });
  });

  it("another customer in the same group gets the group's price, not ACME's", () => {
    const b = priceItem(sale({ customerType: "B2B", customerGroupId: GROUP_DISTRIBUTORS, customerId: "0000000000000000000000f9" }));
    expect(b.rules.making?.source).toMatchObject({ ruleName: "Distributors" });
    expect(b.finalAmount).toBe(16_797_930);
  });

  it("customer-specific pricing is a discount off ordinary pricing, and the breakdown proves it", () => {
    const ordinary = priceItem(sale({ customerType: "B2B" }));
    const acme = priceItem(sale({ customerType: "B2B", customerId: CUSTOMER_ACME }));
    expect(acme.finalAmount).toBeLessThan(ordinary.finalAmount);
    expect(acme.metalValue).toBe(ordinary.metalValue);
  });
});

describe("priceItem — overrides, warnings and effective dating", () => {
  it("a hand-entered override replaces what resolution chose for that dimension, and is recorded as one", () => {
    const b = priceItem(sale({}, { overrides: { makingRule: { type: "FIXED", value: 100_000 } } }));
    expect(b.makingCharges).toBe(100_000);
    expect(b.rules.making).toEqual({ terms: { type: "FIXED", value: 100_000 }, source: { kind: "OVERRIDE" } });
    expect(b.rules.wastage?.source).toMatchObject({ kind: "RULE", ruleName: "Gold default" });
  });

  it("an override can supply a discount that no rule grants", () => {
    const b = priceItem(sale({}, { overrides: { discountRule: { type: "PERCENTAGE", value: 10, appliesTo: "MAKING_CHARGES" } } }));
    expect(b.discount).toBe(183_300);
  });

  it("warns — but still prices — when no making rule applies", () => {
    const b = priceItem(sale({}, { rules: [] }));
    expect(b.makingCharges).toBe(0);
    expect(b.rules.making).toBeNull();
    expect(b.warnings.map((w) => w.code)).toEqual(["NO_MAKING_RULE"]);
  });

  it("does not warn about a missing making rule when one was entered by hand", () => {
    const b = priceItem(sale({}, { rules: [], overrides: { makingRule: { type: "PERCENTAGE", value: 10 } } }));
    expect(b.warnings).toEqual([]);
  });

  it("surfaces an ambiguity between equally-ranked rules, and still prices deterministically", () => {
    const twins = [rule(1, { name: "A", makingChargeValue: 10 }), rule(2, { name: "B", makingChargeValue: 11 })];
    const b = priceItem(sale({}, { rules: twins }));
    expect(b.warnings.map((w) => w.code)).toEqual(["AMBIGUOUS_RULES"]);
    expect(b.rules.making?.source).toMatchObject({ ruleName: "A" });
  });

  it("stays quiet about an ambiguity in a dimension the caller overrode", () => {
    const twins = [rule(1, { makingChargeValue: 10 }), rule(2, { makingChargeValue: 11 })];
    const b = priceItem(sale({}, { rules: twins, overrides: { makingRule: { type: "PERCENTAGE", value: 8 } } }));
    expect(b.warnings).toEqual([]);
  });

  it("carries margin warnings through from the calculation", () => {
    expect(priceItem(sale({}, { cost: 99_000_000 })).warnings.map((w) => w.code)).toEqual(["BELOW_COST"]);
  });

  it("prices a past date with the rules that were in force then (replayable, effective-dated)", () => {
    const book = [
      rule(1, { name: "old", makingChargeValue: 10, validTo: new Date("2026-07-01") }),
      rule(2, { name: "new", makingChargeValue: 14, validFrom: new Date("2026-07-01") }),
    ];
    const before = priceItem(sale({ asOf: new Date("2026-06-15") }, { rules: book }));
    const after = priceItem(sale({ asOf: new Date("2026-07-15") }, { rules: book }));
    expect(before.makingCharges).toBe(1_527_500); // 10% of ₹1,52,750
    expect(after.makingCharges).toBe(2_138_500); // 14%
    expect(priceItem(sale({ asOf: new Date("2026-06-15") }, { rules: book }))).toEqual(before);
  });

  it("applies a rule quoted for the piece's purity only to that purity", () => {
    const book = [rule(1, { purity: "18K", makingChargeValue: 30 }), rule(2, { makingChargeValue: 12 })];
    expect(priceItem(sale({}, { rules: book })).rules.making?.source).toMatchObject({ ruleName: "rule 2" });
  });

  it("propagates unusable input as a PricingError", () => {
    expect(() => priceItem(sale({}, { grossWeight: 5, stoneWeight: 6 }))).toThrow(PricingError);
  });

  it("does not mutate a frozen request", () => {
    expect(() => priceItem(deepFreeze(sale({ customerId: CUSTOMER_ACME, customerType: "B2B" })))).not.toThrow();
  });
});

describe("priceItem — the rule book's order never changes the price", () => {
  it("gives the identical breakdown for 100 shuffles of the book, for each kind of buyer", () => {
    const random = seeded(99);
    const shuffle = <T,>(items: T[]) => {
      const copy = [...items];
      for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [copy[i], copy[j]] = [copy[j]!, copy[i]!];
      }
      return copy;
    };
    const buyers: Partial<PricingContext>[] = [{}, { customerType: "B2B" }, { categoryId: CAT_BANGLES }, { customerType: "B2B", customerGroupId: GROUP_DISTRIBUTORS }, { customerType: "B2B", customerId: CUSTOMER_ACME }];
    for (const buyer of buyers) {
      const canonical = priceItem(sale(buyer));
      for (let i = 0; i < 100; i++) expect(priceItem(sale(buyer, { rules: shuffle(RULE_BOOK) }))).toEqual(canonical);
    }
  });

  it("uses the same metal, weights, rate and tax for every channel — only rules differ", () => {
    const erp = priceItem(sale({ channel: "ERP" }));
    const b2c = priceItem(sale({ channel: "B2C" }));
    expect(b2c).toEqual(erp);
  });
});
