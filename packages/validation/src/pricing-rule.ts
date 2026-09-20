import { z } from "zod";
import { zCalculationType, zChannel, zCustomerType, zId } from "./common";

export const discountSchema = z.object({
  type: z.enum(["PERCENTAGE", "FLAT"]),
  value: z.number().nonnegative(),
});

/**
 * Business-rule validation beyond shape: a rule must actually do something (at least one
 * of makingCharge/wastage/discount set), a percentage-based value must be 0–100, and
 * validTo (when set) must be after validFrom. See pricing-rule.validation.ts in apps/api
 * for the priority/overlap resolution contract this feeds into.
 */
export const createPricingRuleSchema = z
  .object({
    name: z.string().min(1),

    customerType: zCustomerType.optional(),
    customerGroupId: zId.optional(),
    priceListId: zId.optional(),
    metalId: zId.optional(),
    purity: z.string().optional(),
    categoryId: zId.optional(),
    channel: z.union([zChannel, z.literal("BOTH")]).default("BOTH"),

    makingChargeType: zCalculationType.optional(),
    makingChargeValue: z.number().nonnegative().optional(),

    wastageType: z.enum(["PERCENTAGE", "PER_GRAM"]).optional(),
    wastageValue: z.number().nonnegative().optional(),

    discount: discountSchema.optional(),

    priority: z.number().int().min(0).default(0),
    validFrom: z.coerce.date(),
    validTo: z.coerce.date().optional(),
    isActive: z.boolean().default(true),
  })
  .refine((data) => data.makingChargeType !== undefined || data.wastageType !== undefined || data.discount !== undefined, {
    message: "a pricing rule must set at least one of makingCharge, wastage or discount",
    path: ["makingChargeType"],
  })
  .refine((data) => (data.makingChargeType === undefined) === (data.makingChargeValue === undefined), {
    message: "makingChargeType and makingChargeValue must be set together",
    path: ["makingChargeValue"],
  })
  .refine((data) => (data.wastageType === undefined) === (data.wastageValue === undefined), {
    message: "wastageType and wastageValue must be set together",
    path: ["wastageValue"],
  })
  .refine((data) => data.makingChargeType !== "PERCENTAGE" || (data.makingChargeValue ?? 0) <= 100, {
    message: "a PERCENTAGE makingChargeValue cannot exceed 100",
    path: ["makingChargeValue"],
  })
  .refine((data) => data.wastageType !== "PERCENTAGE" || (data.wastageValue ?? 0) <= 100, {
    message: "a PERCENTAGE wastageValue cannot exceed 100",
    path: ["wastageValue"],
  })
  .refine((data) => data.discount?.type !== "PERCENTAGE" || (data.discount?.value ?? 0) <= 100, {
    message: "a PERCENTAGE discount value cannot exceed 100",
    path: ["discount", "value"],
  })
  .refine((data) => !data.validTo || data.validTo > data.validFrom, {
    message: "validTo must be after validFrom",
    path: ["validTo"],
  });
export type CreatePricingRuleInput = z.input<typeof createPricingRuleSchema>;

// Partial updates skip the cross-field refinements above by design — callers should
// re-run them against the merged document in the repository layer before persisting.
export const updatePricingRuleFieldsSchema = z.object({
  name: z.string().min(1).optional(),
  customerType: zCustomerType.optional(),
  customerGroupId: zId.optional(),
  priceListId: zId.optional(),
  metalId: zId.optional(),
  purity: z.string().optional(),
  categoryId: zId.optional(),
  channel: z.union([zChannel, z.literal("BOTH")]).optional(),
  makingChargeType: zCalculationType.optional(),
  makingChargeValue: z.number().nonnegative().optional(),
  wastageType: z.enum(["PERCENTAGE", "PER_GRAM"]).optional(),
  wastageValue: z.number().nonnegative().optional(),
  discount: discountSchema.optional(),
  priority: z.number().int().min(0).optional(),
  validFrom: z.coerce.date().optional(),
  validTo: z.coerce.date().optional(),
  isActive: z.boolean().optional(),
});
export type UpdatePricingRuleFieldsInput = z.input<typeof updatePricingRuleFieldsSchema>;
