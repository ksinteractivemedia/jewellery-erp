import type { AppliedRule, Discount, Id, MakingTerms, PricingContext, PricingRule, PricingWarning, RuleTier, WastageTerms } from "@jewellery/types";
import { PricingError } from "./errors";

export type RuleDimension = "making" | "wastage" | "discount";

/** What rule matching needs beyond who is buying: which piece is being priced. */
export type RuleMatchContext = PricingContext & { metalId: Id; purity: string };

export interface RuleResolution {
  making: AppliedRule<MakingTerms> | null;
  wastage: AppliedRule<WastageTerms> | null;
  discount: AppliedRule<Discount> | null;
  /** Set per dimension when the winner was chosen only by the final id tie-break. */
  ambiguities: Partial<Record<RuleDimension, PricingWarning>>;
}

const TIER_ORDER: readonly RuleTier[] = ["CUSTOMER", "CUSTOMER_GROUP", "PRICE_LIST", "CATEGORY", "DEFAULT"];
const norm = (purity: string) => purity.trim().toUpperCase();

const time = (date: Date, field: string): number => {
  const t = date instanceof Date ? date.getTime() : Number.NaN;
  if (Number.isNaN(t)) throw new PricingError("INVALID_INPUT", `${field} must be a valid date`, field);
  return t;
};

/** Effective from `validFrom` (inclusive) until `validTo` (exclusive). */
export function isRuleEffective(rule: Pick<PricingRule, "isActive" | "validFrom" | "validTo">, asOf: Date): boolean {
  if (!rule.isActive) return false;
  const at = time(asOf, "asOf");
  if (time(rule.validFrom, "rule.validFrom") > at) return false;
  return rule.validTo === undefined || at < time(rule.validTo, "rule.validTo");
}

/** The most specific "who" a rule names decides its tier; metal / purity / customer type / channel only narrow it. */
export function tierOf(rule: PricingRule): RuleTier {
  if (rule.customerId) return "CUSTOMER";
  if (rule.customerGroupId) return "CUSTOMER_GROUP";
  if (rule.priceListId) return "PRICE_LIST";
  if (rule.categoryId) return "CATEGORY";
  return "DEFAULT";
}

/** How many scope fields a rule pins down — the tie-break inside a tier and priority. */
function specificity(rule: PricingRule): number {
  return [rule.customerId, rule.customerGroupId, rule.priceListId, rule.categoryId, rule.customerType, rule.metalId, rule.purity, rule.channel !== "BOTH" ? rule.channel : undefined].filter(Boolean).length;
}

function appliesTo(rule: PricingRule, ctx: RuleMatchContext): boolean {
  return (
    isRuleEffective(rule, ctx.asOf) &&
    (rule.channel === "BOTH" || rule.channel === ctx.channel) &&
    (!rule.customerType || rule.customerType === ctx.customerType) &&
    (!rule.customerId || rule.customerId === ctx.customerId) &&
    (!rule.customerGroupId || rule.customerGroupId === ctx.customerGroupId) &&
    (!rule.priceListId || rule.priceListId === ctx.priceListId) &&
    (!rule.categoryId || rule.categoryId === ctx.categoryId) &&
    (!rule.metalId || rule.metalId === ctx.metalId) &&
    (!rule.purity || norm(rule.purity) === norm(ctx.purity))
  );
}

/** Equal on every ranking step before the arbitrary id tie-break. */
const tiesBeforeId = (a: PricingRule, b: PricingRule) =>
  tierOf(a) === tierOf(b) && a.priority === b.priority && specificity(a) === specificity(b) && time(a.validFrom, "rule.validFrom") === time(b.validFrom, "rule.validFrom");

/**
 * A TOTAL order over rules, so the winner never depends on the order they were passed in:
 * tier (customer → group → price list → category → default), then higher `priority`, then more
 * specific scope, then later `validFrom`, then lowest id. Only the last step is arbitrary, and
 * `resolvePricingRules` reports it as a warning when it decides anything.
 */
export function compareRules(a: PricingRule, b: PricingRule): number {
  return (
    TIER_ORDER.indexOf(tierOf(a)) - TIER_ORDER.indexOf(tierOf(b)) ||
    b.priority - a.priority ||
    specificity(b) - specificity(a) ||
    time(b.validFrom, "rule.validFrom") - time(a.validFrom, "rule.validFrom") ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}

function termsOf(rule: PricingRule, dimension: RuleDimension): MakingTerms | WastageTerms | Discount | undefined {
  const bad = (what: string) => new PricingError("INVALID_RULE", `pricing rule "${rule.name}" (${rule.id}) has ${what}`, `rule.${rule.id}`);
  switch (dimension) {
    case "making":
      if (rule.makingChargeType === undefined) return undefined;
      if (rule.makingChargeValue === undefined) throw bad("a making charge type but no value");
      return { type: rule.makingChargeType, value: rule.makingChargeValue };
    case "wastage":
      if (rule.wastageType === undefined) return undefined;
      if (rule.wastageType === "NONE") return { type: "NONE" };
      if (rule.wastageValue === undefined) throw bad("a wastage type but no value");
      return { type: rule.wastageType, value: rule.wastageValue };
    case "discount":
      return rule.discount;
  }
}

/**
 * Picks, for each of making / wastage / discount independently, the single rule that governs it.
 * Independent, so a customer's "5% off" rule doesn't erase the default making charge, while a
 * customer-specific wastage of NONE does override a default wastage. Order-independent by construction.
 */
export function resolvePricingRules(rules: readonly PricingRule[], ctx: RuleMatchContext): RuleResolution {
  const ids = new Set<string>();
  for (const rule of rules) {
    if (ids.has(rule.id)) throw new PricingError("INVALID_INPUT", `duplicate pricing rule id ${rule.id}`, "rules");
    ids.add(rule.id);
  }
  const eligible = rules.filter((rule) => appliesTo(rule, ctx));
  const ambiguities: RuleResolution["ambiguities"] = {};

  const pick = <T extends MakingTerms | WastageTerms | Discount>(dimension: RuleDimension): AppliedRule<T> | null => {
    const candidates = eligible.filter((rule) => termsOf(rule, dimension) !== undefined).sort(compareRules);
    const winner = candidates[0];
    if (!winner) return null;
    const tied = candidates.filter((rule) => tiesBeforeId(winner, rule));
    if (tied.length > 1) {
      ambiguities[dimension] = {
        code: "AMBIGUOUS_RULES",
        message: `Rules ${tied.map((r) => `"${r.name}"`).join(" and ")} are equally specific for the ${dimension} (same tier, priority, scope and start date); "${winner.name}" was chosen by id. Give one a higher priority.`,
      };
    }
    return {
      terms: termsOf(winner, dimension) as T,
      source: { kind: "RULE", ruleId: winner.id, ruleName: winner.name, tier: tierOf(winner), priority: winner.priority, shadowedRuleIds: candidates.slice(1).map((r) => r.id) },
    };
  };

  return { making: pick<MakingTerms>("making"), wastage: pick<WastageTerms>("wastage"), discount: pick<Discount>("discount"), ambiguities };
}

const SCOPE_KEYS = ["customerId", "customerGroupId", "priceListId", "categoryId", "customerType", "metalId"] as const;

/** Could one calculation match both rules? False as soon as a scope field is set on both, to different values. */
function scopesOverlap(a: PricingRule, b: PricingRule): boolean {
  for (const key of SCOPE_KEYS) if (a[key] && b[key] && a[key] !== b[key]) return false;
  if (a.purity && b.purity && norm(a.purity) !== norm(b.purity)) return false;
  if (a.channel !== "BOTH" && b.channel !== "BOTH" && a.channel !== b.channel) return false;
  return true;
}

function periodsOverlap(a: PricingRule, b: PricingRule): boolean {
  const aEnd = a.validTo ? time(a.validTo, "rule.validTo") : Infinity;
  const bEnd = b.validTo ? time(b.validTo, "rule.validTo") : Infinity;
  return time(a.validFrom, "rule.validFrom") < bEnd && time(b.validFrom, "rule.validFrom") < aEnd;
}

export interface AmbiguousRulePair {
  ruleIds: [Id, Id];
  dimensions: RuleDimension[];
}

/**
 * Save-time check: pairs of active rules that could apply to the same calculation, govern the same
 * dimension, and tie on tier, priority, specificity AND start date — i.e. where only the arbitrary
 * id tie-break would pick the winner. Run it against the stored rules plus a rule being saved, and refuse the save.
 */
export function findAmbiguousRules(rules: readonly PricingRule[]): AmbiguousRulePair[] {
  const active = rules.filter((r) => r.isActive);
  const pairs: AmbiguousRulePair[] = [];
  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      const a = active[i]!;
      const b = active[j]!;
      if (!scopesOverlap(a, b) || !periodsOverlap(a, b) || !tiesBeforeId(a, b)) continue;
      const dimensions = (["making", "wastage", "discount"] as const).filter((d) => termsOf(a, d) !== undefined && termsOf(b, d) !== undefined);
      if (dimensions.length === 0) continue;
      pairs.push({ ruleIds: a.id < b.id ? [a.id, b.id] : [b.id, a.id], dimensions });
    }
  }
  return pairs.sort((p, q) => (p.ruleIds[0] + p.ruleIds[1]).localeCompare(q.ruleIds[0] + q.ruleIds[1]));
}
