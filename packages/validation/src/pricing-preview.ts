import { z } from "zod";
import { zCustomerType, zId } from "./common";
import { zScaleWeight, zStoneWeightValue } from "./inventory-item";
import { discountSchema, makingTermsSchema, wastageTermsSchema } from "./pricing-rule";
import { taxTermsSchema } from "./tax-rule";

const zPaiseAmount = z.number().int("money is whole paise").min(0).max(1_000_000_000_000);

/**
 * The internal pricing playground's request: a what-if calculation, never tied to an order.
 * `making` / `wastage` / `discount` are optional OVERRIDES — left out, the API resolves the stored
 * pricing rules for the customer type instead, and the response says which rule applied.
 * Money is integer paise; the ERP converts what the person types.
 */
export const pricingPreviewSchema = z
  .object({
    metalId: zId,
    /** The item's purity code, e.g. "22K". */
    purity: z.string().min(1),
    grossWeight: zScaleWeight,
    stoneWeight: zStoneWeightValue.default(0),
    pieces: z.number().int().min(1).max(100_000).default(1),
    rate: z.object({
      ratePerGram: z.number().int("money is whole paise").positive().max(1_000_000_000),
      /** The purity the rate is quoted for (gold is usually quoted for 24K). */
      purity: z.string().min(1),
    }),
    stoneValue: zPaiseAmount.default(0),
    /** The line's book cost, to see margin. */
    cost: zPaiseAmount.optional(),
    making: makingTermsSchema.optional(),
    wastage: wastageTermsSchema.optional(),
    discount: discountSchema.optional(),
    customerType: zCustomerType,
    tax: taxTermsSchema.and(z.object({ sellerState: z.string().trim().min(1), buyerState: z.string().trim().min(1) })),
  })
  .refine((r) => r.stoneWeight < r.grossWeight, { message: "stoneWeight must be less than grossWeight — a metal piece needs a positive net weight", path: ["stoneWeight"] });
export type PricingPreviewInput = z.input<typeof pricingPreviewSchema>;
export type PricingPreviewRequest = z.output<typeof pricingPreviewSchema>;
