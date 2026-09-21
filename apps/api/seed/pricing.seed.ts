import { findMetalByCode } from "../src/modules/metals/metal.repository";
import { createPricingRule } from "../src/modules/pricing/pricing-rule.repository";

/**
 * DEVELOPMENT ONLY — a small, believable rule book for the pricing playground: a retail and a wholesale default
 * for gold, a studded-18K rule that outranks the retail default for that purity, a silver rule, and a festive
 * offer that only sets a discount (so it leaves making and wastage to the defaults). The figures are
 * illustrative, not a recommendation. Goes through `createPricingRule`, so the ambiguity guard checks the book
 * as it is built. Nothing under src/ imports this; only scripts/dev-memory.ts does.
 */
export async function seedPricingRules(): Promise<{ rules: number }> {
  const gold = await findMetalByCode("GOLD");
  const silver = await findMetalByCode("SILVER");
  if (!gold || !silver) throw new Error("seedPricingRules needs the GOLD and SILVER metals (seedCatalog creates them)");
  const from = new Date("2026-01-01");

  const rules = [
    { name: "Gold — retail default", metalId: gold.id, customerType: "B2C" as const, makingChargeType: "PERCENTAGE" as const, makingChargeValue: 12, wastageType: "PERCENTAGE" as const, wastageValue: 2 },
    { name: "Gold — wholesale default", metalId: gold.id, customerType: "B2B" as const, makingChargeType: "PERCENTAGE" as const, makingChargeValue: 9, wastageType: "PERCENTAGE" as const, wastageValue: 1 },
    { name: "Gold 18K studded — retail", metalId: gold.id, purity: "18K", customerType: "B2C" as const, makingChargeType: "PER_GRAM" as const, makingChargeValue: 65_000, wastageType: "FIXED_WEIGHT" as const, wastageValue: 0.15 },
    { name: "Silver — all customers", metalId: silver.id, makingChargeType: "PER_GRAM" as const, makingChargeValue: 800, wastageType: "NONE" as const },
    { name: "Akshaya Tritiya — 22K retail offer", metalId: gold.id, purity: "22K", customerType: "B2C" as const, discount: { type: "PERCENTAGE" as const, value: 50, appliesTo: "MAKING_CHARGES" as const } },
  ];
  for (const rule of rules) await createPricingRule({ ...rule, validFrom: from });
  return { rules: rules.length };
}
