import { z } from "zod";
import { zChannel, zCustomerType, zId } from "./common";

/** At most `places` decimals, tolerating float noise (0.1 + 0.2). */
const hasAtMostDecimals = (n: number, places: number) => Math.abs(n * 10 ** places - Math.round(n * 10 ** places)) < 1e-6;

const MAX_PAISE = 1_000_000_000_000; // ₹10,000 crore — far beyond any line, but keeps every product inside Number's safe integers.

export const MAKING_CHARGE_TYPES = ["PERCENTAGE", "PER_GRAM", "FIXED", "PER_PIECE"] as const;
export const WASTAGE_TYPES = ["PERCENTAGE", "FIXED_WEIGHT", "NONE"] as const;

/** Percent 0–100 with at most 6 decimals (the engine's precision). */
const zPercentValue = z.number().finite().min(0).max(100).refine((n) => hasAtMostDecimals(n, 6), "at most 6 decimal places");
const zPaiseValue = z.number().int("money is whole paise").min(0).max(MAX_PAISE);

export const discountSchema = z
  .object({
    type: z.enum(["PERCENTAGE", "FLAT"]),
    value: z.number().finite().nonnegative(),
    appliesTo: z.enum(["TOTAL", "MAKING_CHARGES"]).optional(),
  })
  .superRefine((d, ctx) => {
    const check = d.type === "PERCENTAGE" ? zPercentValue : zPaiseValue;
    const result = check.safeParse(d.value);
    if (!result.success) for (const issue of result.error.issues) ctx.addIssue({ ...issue, path: ["value"] });
  });

/** Making terms as typed in by a person or read from a rule: the value's unit depends on the type. */
export const makingTermsSchema = z
  .object({ type: z.enum(MAKING_CHARGE_TYPES), value: z.number().finite().nonnegative() })
  .superRefine((m, ctx) => {
    const check = m.type === "PERCENTAGE" ? zPercentValue : zPaiseValue;
    const result = check.safeParse(m.value);
    if (!result.success) for (const issue of result.error.issues) ctx.addIssue({ ...issue, path: ["value"] });
  });

export const wastageTermsSchema = z
  .object({ type: z.enum(WASTAGE_TYPES), value: z.number().finite().nonnegative().optional() })
  .superRefine((w, ctx) => {
    if (w.type === "NONE") {
      if (w.value !== undefined && w.value !== 0) ctx.addIssue({ code: "custom", path: ["value"], message: "wastage NONE takes no value" });
      return;
    }
    if (w.value === undefined) return void ctx.addIssue({ code: "custom", path: ["value"], message: `wastage ${w.type} needs a value` });
    const check = w.type === "PERCENTAGE" ? zPercentValue : z.number().max(1_000_000).refine((n) => hasAtMostDecimals(n, 3), "at most 3 decimal places (grams)");
    const result = check.safeParse(w.value);
    if (!result.success) for (const issue of result.error.issues) ctx.addIssue({ ...issue, path: ["value"] });
  });

const ruleShape = {
  name: z.string().min(1),

  customerId: zId.optional(),
  customerGroupId: zId.optional(),
  priceListId: zId.optional(),
  categoryId: zId.optional(),
  customerType: zCustomerType.optional(),
  metalId: zId.optional(),
  purity: z.string().min(1).optional(),
  channel: z.union([zChannel, z.literal("BOTH")]),

  makingChargeType: z.enum(MAKING_CHARGE_TYPES).optional(),
  makingChargeValue: z.number().finite().nonnegative().optional(),

  wastageType: z.enum(WASTAGE_TYPES).optional(),
  wastageValue: z.number().finite().nonnegative().optional(),

  discount: discountSchema.optional(),

  priority: z.number().int().min(0),
  validFrom: z.coerce.date(),
  validTo: z.coerce.date().optional(),
  isActive: z.boolean(),
};

/**
 * Business-rule validation beyond shape: a rule must actually do something (at least one of
 * making/wastage/discount), each dimension's value must suit its type (percent 0–100; money as whole
 * paise; wastage weight in grams), and validTo (when set) must be after validFrom. Whether a rule would
 * be *ambiguous* against other stored rules is checked where the other rules are known — see
 * `assertNoAmbiguousPricingRule` in apps/api.
 */
export const createPricingRuleSchema = z
  .object({ ...ruleShape, channel: ruleShape.channel.default("BOTH"), priority: ruleShape.priority.default(0), isActive: ruleShape.isActive.default(true) })
  .superRefine(validateRuleDimensions);
export type CreatePricingRuleInput = z.input<typeof createPricingRuleSchema>;

function validateRuleDimensions(rule: { makingChargeType?: string; makingChargeValue?: number; wastageType?: string; wastageValue?: number; discount?: unknown; validFrom: Date; validTo?: Date }, ctx: z.RefinementCtx) {
  if (rule.makingChargeType === undefined && rule.wastageType === undefined && rule.discount === undefined) {
    ctx.addIssue({ code: "custom", path: ["makingChargeType"], message: "a pricing rule must set at least one of makingCharge, wastage or discount" });
  }
  if ((rule.makingChargeType === undefined) !== (rule.makingChargeValue === undefined)) {
    ctx.addIssue({ code: "custom", path: ["makingChargeValue"], message: "makingChargeType and makingChargeValue must be set together" });
  } else if (rule.makingChargeType !== undefined) {
    const result = makingTermsSchema.safeParse({ type: rule.makingChargeType, value: rule.makingChargeValue });
    if (!result.success) for (const issue of result.error.issues) ctx.addIssue({ ...issue, path: ["makingChargeValue"], message: `makingChargeValue: ${issue.message}` });
  }
  if (rule.wastageType === undefined) {
    if (rule.wastageValue !== undefined) ctx.addIssue({ code: "custom", path: ["wastageType"], message: "wastageValue is set without a wastageType" });
  } else {
    const result = wastageTermsSchema.safeParse({ type: rule.wastageType, value: rule.wastageValue });
    if (!result.success) for (const issue of result.error.issues) ctx.addIssue({ ...issue, path: ["wastageValue"], message: `wastageValue: ${issue.message}` });
  }
  if (rule.validTo && rule.validTo <= rule.validFrom) {
    ctx.addIssue({ code: "custom", path: ["validTo"], message: "validTo must be after validFrom" });
  }
}

// Partial updates skip the cross-field refinements above by design — callers re-run them against
// the merged document in the repository layer before persisting (assertValidMergedPricingRule).
export const updatePricingRuleFieldsSchema = z.object(ruleShape).partial();
export type UpdatePricingRuleFieldsInput = z.input<typeof updatePricingRuleFieldsSchema>;
