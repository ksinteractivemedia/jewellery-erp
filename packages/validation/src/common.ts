import { z } from "zod";

/** A Mongo ObjectId, as a string — this package has zero Mongoose dependency (architecture.md §2). */
export const zId = z.string().regex(/^[0-9a-fA-F]{24}$/, "must be a valid id");

/** Integer paise. Never a float — see docs/data-model.md. */
export const zPaise = z.number().int().nonnegative();

/** Grams, non-negative. Precision is enforced by rounding at the service layer, not here. */
export const zGrams = z.number().nonnegative().finite();

export const zPercent = z.number().min(0).max(100);

export const zChannel = z.enum(["ERP", "B2C", "B2B"]);
export const zChannelVisibility = z.enum(["ERP", "B2C", "B2B", "BOTH"]);
export const zCustomerType = z.enum(["B2C", "B2B"]);
export const zCalculationType = z.enum(["PERCENTAGE", "FLAT", "PER_GRAM"]);

export const zAddress = z.object({
  line1: z.string().min(1),
  line2: z.string().optional(),
  city: z.string().min(1),
  state: z.string().min(1),
  postalCode: z.string().min(1),
  country: z.string().min(1),
});

export const zStoneDetail = z.object({
  stoneId: zId.optional(),
  name: z.string().min(1),
  caratWeight: z.number().nonnegative(),
  quantity: z.number().int().positive(),
  quality: z.string().optional(),
  certificateNumber: z.string().optional(),
});
