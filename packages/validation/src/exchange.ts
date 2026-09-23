import { z } from "zod";
import { zId, zPaise } from "./common";

const text = (max: number) => z.string().trim().min(1).max(max);

export const exchangeSettlementMethodSchema = z.enum(["CASH", "CARD", "UPI", "BANK_TRANSFER", "CHEQUE", "STORE_CREDIT"]);

/** What we actually assess the old piece at — never taken on trust from what the customer claims it is. */
export const oldJewelleryAssessmentSchema = z
  .object({
    description: text(300),
    metalId: zId,
    claimedPurity: z.string().trim().max(20).optional(),
    grossWeight: z.number().finite().positive(),
    stoneWeight: z.number().finite().nonnegative().default(0),
    assessedPurity: z.string().trim().min(1).max(20),
    /** What we're crediting per gram of net weight at the assessed purity — business-rules.md §1.8's "rate for the piece's purity", the same convention every other rate in this system uses. */
    ratePerGram: zPaise,
    deduction: zPaise.default(0),
    notes: text(500).optional(),
  })
  .strict()
  .refine((d) => d.stoneWeight <= d.grossWeight, { message: "stoneWeight cannot exceed grossWeight", path: ["stoneWeight"] });
export type OldJewelleryAssessmentInput = z.output<typeof oldJewelleryAssessmentSchema>;

export const createExchangeSchema = z
  .object({
    customer: z.object({ id: zId.optional(), name: text(200), phone: z.string().trim().max(20).optional(), email: z.string().trim().email().optional() }),
    oldJewellery: oldJewelleryAssessmentSchema,
    notes: text(500).optional(),
  })
  .strict();
export type CreateExchangeInput = z.output<typeof createExchangeSchema>;

/** Re-assess before taking the piece in — the same shape, re-entered rather than patched, so nothing is silently half-updated. */
export const assessExchangeSchema = z.object({ oldJewellery: oldJewelleryAssessmentSchema }).strict();
export type AssessExchangeInput = z.output<typeof assessExchangeSchema>;

export const completeExchangeSchema = z
  .object({
    /** Where the old piece physically lands once taken in. */
    locationId: zId,
    newProduct: z.object({
      productId: zId,
      variantId: zId.optional(),
      sku: text(64),
      name: text(200),
      quantity: z.number().int().positive().default(1),
      unitPrice: zPaise,
      lineTotal: zPaise,
    }),
    orderId: zId.optional(),
    orderNo: text(64).optional(),
    settlement: z.object({
      method: exchangeSettlementMethodSchema.optional(),
      reference: text(120).optional(),
      note: text(300).optional(),
    }),
  })
  .strict();
export type CompleteExchangeInput = z.output<typeof completeExchangeSchema>;

export const cancelExchangeSchema = z.object({ reason: text(500).optional() }).strict();
