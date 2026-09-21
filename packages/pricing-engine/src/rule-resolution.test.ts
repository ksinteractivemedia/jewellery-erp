import { describe, expect, it } from "vitest";
import type { PricingRule } from "@jewellery/types";
import { PricingError } from "./errors";
import { GOLD, NOW, context, deepFreeze, rule, seeded } from "./fixtures";
import { compareRules, findAmbiguousRules, isRuleEffective, resolvePricingRules, tierOf, type RuleMatchContext } from "./rule-resolution";

const CAT = "0000000000000000000000c1";
const LIST = "0000000000000000000000d1";
const GROUP = "0000000000000000000000e1";
const CUSTOMER = "0000000000000000000000f1";

const ctx = (overrides: Partial<RuleMatchContext> = {}): RuleMatchContext => ({ ...context(), metalId: GOLD, purity: "22K", ...overrides });
const makingPercent = (r: ReturnType<typeof resolvePricingRules>) => (r.making?.terms.type === "PERCENTAGE" ? r.making.terms.value : undefined);

/** One rule per tier, each with a distinct making %, so the winner is readable from the number. */
const LADDER: PricingRule[] = [
  rule(1, { name: "default", makingChargeValue: 12 }),
  rule(2, { name: "category", categoryId: CAT, makingChargeValue: 7 }),
  rule(3, { name: "price list", priceListId: LIST, makingChargeValue: 6 }),
  rule(4, { name: "group", customerGroupId: GROUP, makingChargeValue: 5 }),
  rule(5, { name: "customer", customerId: CUSTOMER, makingChargeValue: 4 }),
];

describe("resolution order: customer → customer group → price list → category → default", () => {
  it.each([
    ["nothing special about the buyer", {}, 12, "DEFAULT"],
    ["a category the rule names", { categoryId: CAT }, 7, "CATEGORY"],
    ["a category and a price list", { categoryId: CAT, priceListId: LIST }, 6, "PRICE_LIST"],
    ["… and a customer group", { categoryId: CAT, priceListId: LIST, customerGroupId: GROUP }, 5, "CUSTOMER_GROUP"],
    ["… and the customer themself", { categoryId: CAT, priceListId: LIST, customerGroupId: GROUP, customerId: CUSTOMER }, 4, "CUSTOMER"],
  ] as const)("%s", (_name, buyer, expectedPercent, tier) => {
    const result = resolvePricingRules(LADDER, ctx(buyer));
    expect(makingPercent(result)).toBe(expectedPercent);
    expect(result.making?.source).toMatchObject({ kind: "RULE", tier });
  });

  it("lists the rules a winner shadowed, most specific first", () => {
    const result = resolvePricingRules(LADDER, ctx({ categoryId: CAT, priceListId: LIST, customerGroupId: GROUP, customerId: CUSTOMER }));
    expect(result.making?.source).toMatchObject({ ruleName: "customer", shadowedRuleIds: [LADDER[3]!.id, LADDER[2]!.id, LADDER[1]!.id, LADDER[0]!.id] });
  });

  it("never lets a higher priority number lift a rule above a more specific tier", () => {
    const rules = [rule(1, { name: "loud default", priority: 999, makingChargeValue: 20 }), rule(2, { name: "quiet category", categoryId: CAT, priority: 0, makingChargeValue: 7 })];
    expect(makingPercent(resolvePricingRules(rules, ctx({ categoryId: CAT })))).toBe(7);
  });

  it("ignores rules scoped to a different customer, group, price list or category", () => {
    const other = "0000000000000000000000ff";
    const result = resolvePricingRules(LADDER, ctx({ categoryId: other, priceListId: other, customerGroupId: other, customerId: other }));
    expect(makingPercent(result)).toBe(12);
  });

  it("classifies a rule by the most specific 'who' it names", () => {
    expect(tierOf(rule(1, { customerId: CUSTOMER, customerGroupId: GROUP, categoryId: CAT }))).toBe("CUSTOMER");
    expect(tierOf(rule(1, { customerGroupId: GROUP, categoryId: CAT }))).toBe("CUSTOMER_GROUP");
    expect(tierOf(rule(1, { metalId: GOLD, purity: "22K", customerType: "B2B", channel: "ERP" }))).toBe("DEFAULT");
  });

  it("needs EVERY scope a rule names to match — a customer-and-category rule doesn't apply to the customer's other categories", () => {
    const rules = [rule(1, { makingChargeValue: 12 }), rule(2, { customerId: CUSTOMER, categoryId: CAT, makingChargeValue: 3 })];
    expect(makingPercent(resolvePricingRules(rules, ctx({ customerId: CUSTOMER })))).toBe(12);
    expect(makingPercent(resolvePricingRules(rules, ctx({ customerId: CUSTOMER, categoryId: CAT })))).toBe(3);
  });
});

describe("resolution within a tier: priority → specificity → latest validFrom → id", () => {
  it("prefers the higher priority", () => {
    const rules = [rule(1, { priority: 1, makingChargeValue: 10 }), rule(2, { priority: 5, makingChargeValue: 11 }), rule(3, { priority: 3, makingChargeValue: 12 })];
    expect(makingPercent(resolvePricingRules(rules, ctx()))).toBe(11);
  });

  it("prefers the more specific scope at equal priority (metal + purity + customer type beats a bare default)", () => {
    const rules = [rule(1, { makingChargeValue: 12 }), rule(2, { metalId: GOLD, makingChargeValue: 11 }), rule(3, { metalId: GOLD, purity: "22K", customerType: "B2C", makingChargeValue: 9 })];
    expect(makingPercent(resolvePricingRules(rules, ctx()))).toBe(9);
  });

  it("prefers the rule that started most recently at equal priority and specificity", () => {
    const rules = [rule(1, { validFrom: new Date("2026-01-01"), makingChargeValue: 10 }), rule(2, { validFrom: new Date("2026-06-01"), makingChargeValue: 11 })];
    const result = resolvePricingRules(rules, ctx());
    expect(makingPercent(result)).toBe(11);
    expect(result.ambiguities).toEqual({});
  });

  it("falls back to the lowest id when everything else ties — and says so", () => {
    const rules = [rule(2, { name: "B", makingChargeValue: 11 }), rule(1, { name: "A", makingChargeValue: 10 })];
    const result = resolvePricingRules(rules, ctx());
    expect(makingPercent(result)).toBe(10);
    expect(result.ambiguities.making).toMatchObject({ code: "AMBIGUOUS_RULES" });
    expect(result.ambiguities.making?.message).toContain('"A"');
    expect(result.ambiguities.making?.message).toContain('"B"');
  });

  it("does not report an ambiguity for a dimension where the tied rules disagree only elsewhere", () => {
    const rules = [rule(1, { makingChargeValue: 10 }), rule(2, { makingChargeType: undefined, makingChargeValue: undefined, discount: { type: "PERCENTAGE", value: 5 } })];
    expect(resolvePricingRules(rules, ctx()).ambiguities).toEqual({});
  });
});

describe("each dimension (making / wastage / discount) resolves independently", () => {
  const defaults = rule(1, { name: "shop default", makingChargeValue: 12, wastageType: "PERCENTAGE", wastageValue: 3 });

  it("a customer rule that only grants a discount leaves making and wastage to the default", () => {
    const vip = rule(2, { name: "vip", customerId: CUSTOMER, makingChargeType: undefined, makingChargeValue: undefined, discount: { type: "PERCENTAGE", value: 5 } });
    const result = resolvePricingRules([defaults, vip], ctx({ customerId: CUSTOMER }));
    expect(result.making?.source).toMatchObject({ ruleName: "shop default" });
    expect(result.wastage?.source).toMatchObject({ ruleName: "shop default" });
    expect(result.discount?.source).toMatchObject({ ruleName: "vip" });
  });

  it("a customer's wastage of NONE overrides the default wastage (NONE is a real choice, not an absence)", () => {
    const noWastage = rule(2, { name: "no wastage", customerId: CUSTOMER, makingChargeType: undefined, makingChargeValue: undefined, wastageType: "NONE" });
    const result = resolvePricingRules([defaults, noWastage], ctx({ customerId: CUSTOMER }));
    expect(result.wastage?.terms).toEqual({ type: "NONE" });
    expect(result.making?.source).toMatchObject({ ruleName: "shop default" });
  });

  it("returns null for a dimension nothing defines", () => {
    const result = resolvePricingRules([rule(1)], ctx());
    expect(result.wastage).toBeNull();
    expect(result.discount).toBeNull();
  });

  it("returns all-null for an empty rule book", () => {
    expect(resolvePricingRules([], ctx())).toEqual({ making: null, wastage: null, discount: null, ambiguities: {} });
  });
});

describe("which rules are eligible at all", () => {
  it("honours effective dating: validFrom inclusive, validTo exclusive", () => {
    const r = rule(1, { validFrom: new Date("2026-09-20T00:00:00Z"), validTo: new Date("2026-10-01T00:00:00Z") });
    const at = (iso: string) => resolvePricingRules([r], ctx({ asOf: new Date(iso) })).making !== null;
    expect(at("2026-09-19T23:59:59.999Z")).toBe(false);
    expect(at("2026-09-20T00:00:00.000Z")).toBe(true);
    expect(at("2026-09-30T23:59:59.999Z")).toBe(true);
    expect(at("2026-10-01T00:00:00.000Z")).toBe(false);
  });

  it("lets back-to-back rules hand over cleanly with no gap and no overlap", () => {
    const rules = [rule(1, { validTo: new Date("2026-07-01"), makingChargeValue: 10 }), rule(2, { validFrom: new Date("2026-07-01"), makingChargeValue: 11 })];
    expect(makingPercent(resolvePricingRules(rules, ctx({ asOf: new Date("2026-06-30T23:59:59Z") })))).toBe(10);
    const handover = resolvePricingRules(rules, ctx({ asOf: new Date("2026-07-01T00:00:00Z") }));
    expect(makingPercent(handover)).toBe(11);
    expect(handover.ambiguities).toEqual({});
  });

  it("skips inactive rules", () => {
    expect(resolvePricingRules([rule(1, { isActive: false })], ctx()).making).toBeNull();
  });

  it("matches on channel: BOTH matches any, a named channel only itself", () => {
    const rules = [rule(1, { channel: "B2B", makingChargeValue: 8 })];
    expect(resolvePricingRules(rules, ctx({ channel: "ERP" })).making).toBeNull();
    expect(makingPercent(resolvePricingRules(rules, ctx({ channel: "B2B" })))).toBe(8);
    expect(resolvePricingRules([rule(1, { channel: "BOTH" })], ctx({ channel: "B2C" })).making).not.toBeNull();
  });

  it("matches on customer type, metal and purity (purity compared case-insensitively)", () => {
    expect(resolvePricingRules([rule(1, { customerType: "B2B" })], ctx({ customerType: "B2C" })).making).toBeNull();
    expect(resolvePricingRules([rule(1, { metalId: "0000000000000000000000aa" })], ctx()).making).toBeNull();
    expect(resolvePricingRules([rule(1, { purity: "18K" })], ctx()).making).toBeNull();
    expect(resolvePricingRules([rule(1, { purity: "22k" })], ctx({ purity: "22K" })).making).not.toBeNull();
  });
});

describe("determinism", () => {
  const book = [
    ...LADDER,
    rule(6, { name: "gold B2B", metalId: GOLD, customerType: "B2B", makingChargeValue: 9, wastageType: "PERCENTAGE", wastageValue: 1 }),
    rule(7, { name: "high priority default", priority: 9, makingChargeValue: 13, discount: { type: "FLAT", value: 5_000 } }),
    rule(8, { name: "newer default", validFrom: new Date("2026-08-01"), wastageType: "FIXED_WEIGHT", wastageValue: 0.2, makingChargeType: undefined, makingChargeValue: undefined }),
    rule(9, { name: "twin of 8", validFrom: new Date("2026-08-01"), wastageType: "FIXED_WEIGHT", wastageValue: 0.3, makingChargeType: undefined, makingChargeValue: undefined }),
  ];
  const situations: Partial<RuleMatchContext>[] = [{}, { customerType: "B2B" }, { categoryId: CAT }, { priceListId: LIST, categoryId: CAT }, { customerGroupId: GROUP, customerType: "B2B" }, { customerId: CUSTOMER, customerType: "B2B" }];

  it("gives the same answer for every ordering of the rules (all 120 orderings of a 5-rule book)", () => {
    const permutations = <T,>(items: T[]): T[][] => (items.length <= 1 ? [items] : items.flatMap((item, i) => permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [item, ...rest])));
    const five = [LADDER[0]!, LADDER[1]!, LADDER[3]!, rule(6, { metalId: GOLD, customerType: "B2B", makingChargeValue: 9 }), rule(7, { priority: 9, makingChargeValue: 13 })];
    const target = ctx({ categoryId: CAT, customerGroupId: GROUP, customerType: "B2B" });
    const canonical = JSON.stringify(resolvePricingRules(five, target));
    const all = permutations(five);
    expect(all).toHaveLength(120);
    for (const order of all) expect(JSON.stringify(resolvePricingRules(order, target))).toBe(canonical);
  });

  it("gives the same answer for 200 shuffles of a 9-rule book in six different situations", () => {
    const random = seeded(7);
    const shuffle = <T,>(items: T[]) => {
      const copy = [...items];
      for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [copy[i], copy[j]] = [copy[j]!, copy[i]!];
      }
      return copy;
    };
    for (const situation of situations) {
      const canonical = JSON.stringify(resolvePricingRules(book, ctx(situation)));
      for (let i = 0; i < 200; i++) expect(JSON.stringify(resolvePricingRules(shuffle(book), ctx(situation)))).toBe(canonical);
    }
  });

  it("orders rules totally: sorting is stable under any starting order", () => {
    const random = seeded(11);
    const sorted = [...book].sort(compareRules).map((r) => r.id);
    for (let i = 0; i < 100; i++) expect([...book].sort(() => random() - 0.5).sort(compareRules).map((r) => r.id)).toEqual(sorted);
  });

  it("never mutates the rules or the context it is given", () => {
    expect(() => resolvePricingRules(deepFreeze([...book]), deepFreeze(ctx({ customerId: CUSTOMER })))).not.toThrow();
  });
});

describe("bad rule books are refused, not skipped", () => {
  const code = (fn: () => unknown) => {
    try {
      fn();
    } catch (error) {
      return error instanceof PricingError ? error.code : String(error);
    }
    return "no error";
  };

  it("rejects two rules with the same id (their order would decide the price)", () => {
    expect(code(() => resolvePricingRules([rule(1), rule(1, { makingChargeValue: 9 })], ctx()))).toBe("INVALID_INPUT");
  });

  it("rejects an applicable rule that names a making type but no value", () => {
    expect(code(() => resolvePricingRules([rule(1, { makingChargeValue: undefined })], ctx()))).toBe("INVALID_RULE");
  });

  it("rejects an applicable rule that names a wastage type (other than NONE) but no value", () => {
    expect(code(() => resolvePricingRules([rule(1, { wastageType: "PERCENTAGE" })], ctx()))).toBe("INVALID_RULE");
  });

  it("rejects an invalid pricing date", () => {
    expect(code(() => resolvePricingRules([rule(1)], ctx({ asOf: new Date("nope") })))).toBe("INVALID_INPUT");
  });

  it("still ignores a broken rule that cannot apply (inactive or out of scope) — only live rules are inspected", () => {
    expect(() => resolvePricingRules([rule(1, { isActive: false, makingChargeValue: undefined }), rule(2, { metalId: "0000000000000000000000aa", makingChargeValue: undefined }), rule(3)], ctx())).not.toThrow();
  });
});

describe("isRuleEffective", () => {
  it("is false for inactive, not-yet-started and expired rules", () => {
    expect(isRuleEffective({ isActive: false, validFrom: new Date("2026-01-01") }, NOW)).toBe(false);
    expect(isRuleEffective({ isActive: true, validFrom: new Date("2026-12-01") }, NOW)).toBe(false);
    expect(isRuleEffective({ isActive: true, validFrom: new Date("2026-01-01"), validTo: new Date("2026-09-01") }, NOW)).toBe(false);
    expect(isRuleEffective({ isActive: true, validFrom: new Date("2026-01-01") }, NOW)).toBe(true);
  });
});

describe("findAmbiguousRules — the save-time guard", () => {
  it("flags two equally-ranked active rules that both set making and could hit the same sale", () => {
    const pairs = findAmbiguousRules([rule(1), rule(2)]);
    expect(pairs).toEqual([{ ruleIds: [rule(1).id, rule(2).id], dimensions: ["making"] }]);
  });

  it("reports every shared dimension", () => {
    const both = { wastageType: "PERCENTAGE" as const, wastageValue: 1, discount: { type: "PERCENTAGE" as const, value: 1 } };
    expect(findAmbiguousRules([rule(1, both), rule(2, both)])[0]?.dimensions).toEqual(["making", "wastage", "discount"]);
  });

  it.each([
    ["different priorities", rule(2, { priority: 1 })],
    ["different specificity", rule(2, { metalId: GOLD })],
    ["different start dates", rule(2, { validFrom: new Date("2026-03-01") })],
    ["mutually exclusive customer types", rule(2, { customerType: "B2B" }), rule(1, { customerType: "B2C" })],
    ["different metals", rule(2, { metalId: GOLD }), rule(1, { metalId: "0000000000000000000000aa" })],
    ["different purities", rule(2, { purity: "18K" }), rule(1, { purity: "22K" })],
    ["different customers", rule(2, { customerId: CUSTOMER }), rule(1, { customerId: "0000000000000000000000f2" })],
    ["different channels", rule(2, { channel: "B2B" }), rule(1, { channel: "B2C" })],
    ["non-overlapping periods", rule(2, { validFrom: new Date("2026-01-01"), validTo: new Date("2026-06-01") }), rule(1, { validFrom: new Date("2026-06-01") })],
    ["disjoint dimensions (one sets making, the other only a discount)", rule(2, { makingChargeType: undefined, makingChargeValue: undefined, discount: { type: "FLAT", value: 1 } })],
    ["an inactive twin", rule(2, { isActive: false })],
  ] as [string, PricingRule, PricingRule?][])("does not flag %s", (_name, second, first = rule(1)) => {
    expect(findAmbiguousRules([first, second])).toEqual([]);
  });

  it("is order-independent and lists each pair once, sorted", () => {
    const rules = [rule(3), rule(1), rule(2)];
    const forward = findAmbiguousRules(rules);
    expect(forward.map((p) => p.ruleIds)).toEqual([
      [rule(1).id, rule(2).id],
      [rule(1).id, rule(3).id],
      [rule(2).id, rule(3).id],
    ]);
    expect(findAmbiguousRules([...rules].reverse())).toEqual(forward);
  });

  it("agrees with resolution: exactly the pairs it flags are the ones resolution warns about", () => {
    const flagged = findAmbiguousRules([rule(1), rule(2)]).length > 0;
    const warned = resolvePricingRules([rule(1), rule(2)], ctx()).ambiguities.making !== undefined;
    expect(flagged).toBe(warned);
  });
});
