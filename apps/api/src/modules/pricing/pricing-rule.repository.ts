import type { PricingRule } from "@jewellery/types";
import {
  createPricingRuleSchema,
  updatePricingRuleFieldsSchema,
  type CreatePricingRuleInput,
  type UpdatePricingRuleFieldsInput,
} from "@jewellery/validation";
import { NotFoundError } from "../../shared/errors";
import { toDTO, toDTOList } from "../../shared/to-dto";
import { PricingRuleModel } from "./pricing-rule.model";
import { assertNoAmbiguousPricingRule, assertValidMergedPricingRule } from "./pricing-rule.validation";

export async function createPricingRule(input: CreatePricingRuleInput): Promise<PricingRule> {
  const parsed = createPricingRuleSchema.parse(input);
  if (parsed.isActive) assertNoAmbiguousPricingRule({ ...parsed, id: "new" } as PricingRule, await listPricingRules({ isActive: true }));
  const doc = await PricingRuleModel.create(parsed);
  return toDTO<PricingRule>(doc)!;
}

export async function findPricingRuleById(id: string): Promise<PricingRule | null> {
  return toDTO<PricingRule>(await PricingRuleModel.findById(id));
}

export async function requirePricingRuleById(id: string): Promise<PricingRule> {
  const rule = await findPricingRuleById(id);
  if (!rule) throw new NotFoundError("PricingRule", id);
  return rule;
}

export async function listPricingRules(
  filter: { metalId?: string; categoryId?: string; customerId?: string; customerGroupId?: string; channel?: string; isActive?: boolean } = {}
): Promise<PricingRule[]> {
  return toDTOList<PricingRule>(await PricingRuleModel.find(filter).sort({ priority: -1 }));
}

/** Validates the *merged* result (not just the patch) before persisting — see pricing-rule.validation.ts. */
export async function updatePricingRule(id: string, input: UpdatePricingRuleFieldsInput): Promise<PricingRule> {
  const parsed = updatePricingRuleFieldsSchema.parse(input);
  const existing = await requirePricingRuleById(id);
  const merged = { ...existing, ...parsed };
  assertValidMergedPricingRule(merged);
  if (merged.isActive) assertNoAmbiguousPricingRule(merged, await listPricingRules({ isActive: true }));

  const doc = await PricingRuleModel.findByIdAndUpdate(id, parsed, { new: true, runValidators: true });
  if (!doc) throw new NotFoundError("PricingRule", id);
  return toDTO<PricingRule>(doc)!;
}
