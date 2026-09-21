import type { Discount, MakingTerms, RuleSource, RuleTier, WastageTerms } from "@jewellery/types";
import { formatCurrency, formatWeight } from "@jewellery/ui";
import { rupees } from "../inventory/format";

/** Words for what the engine applied. Display only — every number shown was computed by the API's pricing engine. */
const money = (paise: number) => formatCurrency(rupees(paise), { precise: true });
const percent = (value: number) => `${value}%`;

export function describeMaking(terms: MakingTerms): string {
  switch (terms.type) {
    case "PERCENTAGE": return `${percent(terms.value)} of the metal value`;
    case "PER_GRAM": return `${money(terms.value)} per gram of net weight`;
    case "FIXED": return `${money(terms.value)} fixed for the line`;
    case "PER_PIECE": return `${money(terms.value)} per piece`;
  }
}

export function describeWastage(terms: WastageTerms): string {
  if (terms.type === "NONE") return "No wastage";
  return terms.type === "PERCENTAGE" ? `${percent(terms.value)} of the net weight` : `${formatWeight(terms.value)} fixed for the line`;
}

export function describeDiscount(terms: Discount): string {
  const base = terms.appliesTo === "MAKING_CHARGES" ? "making charges" : "subtotal";
  return terms.type === "PERCENTAGE" ? `${percent(terms.value)} off the ${base}` : `${money(terms.value)} off the ${base}`;
}

const TIER_LABELS: Record<RuleTier, string> = {
  CUSTOMER: "customer-specific",
  CUSTOMER_GROUP: "customer group",
  PRICE_LIST: "price list",
  CATEGORY: "category",
  DEFAULT: "default",
};

export function describeSource(source: RuleSource): string {
  if (source.kind === "OVERRIDE") return "Entered by hand";
  if (source.kind === "INPUT") return "Given directly";
  const shadowed = source.shadowedRuleIds.length;
  return `Stored rule “${source.ruleName}” · ${TIER_LABELS[source.tier]} tier${shadowed ? ` · outranks ${shadowed} other rule${shadowed === 1 ? "" : "s"}` : ""}`;
}
