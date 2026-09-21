import type { TaxRule } from "@jewellery/types";
import { createTaxRuleSchema, type CreateTaxRuleInput } from "@jewellery/validation";
import { toDTO, toDTOList } from "../../shared/to-dto";
import { TaxRuleModel } from "./tax-rule.model";

export async function createTaxRule(input: CreateTaxRuleInput): Promise<TaxRule> {
  const parsed = createTaxRuleSchema.parse(input);
  return toDTO<TaxRule>(await TaxRuleModel.create(parsed))!;
}

/** Every active rule for an HSN code; the engine's `resolveTaxRule` chooses the one in force. */
export async function listActiveTaxRules(hsnCode?: string): Promise<TaxRule[]> {
  return toDTOList<TaxRule>(await TaxRuleModel.find({ isActive: true, ...(hsnCode ? { hsnCode } : {}) }).sort({ validFrom: -1 }));
}
