import { z } from "zod";
import { zGrams, zId } from "./common";

const zAttributes = z
  .record(z.string().trim().min(1).max(60))
  .refine((a) => Object.keys(a).length <= 10, "at most 10 attributes");

export const createProductVariantSchema = z.object({
  productId: zId,
  sku: z.string().trim().min(1).max(40).toUpperCase(),
  attributes: zAttributes.default({}),
  defaultGrossWeight: zGrams.optional(),
  defaultNetWeight: zGrams.optional(),
  isActive: z.boolean().default(true),
});
export type CreateProductVariantInput = z.input<typeof createProductVariantSchema>;

/** Body for `POST /api/products/:id/variants` — the product comes from the path. */
export const createVariantBodySchema = createProductVariantSchema.omit({ productId: true });
export type CreateVariantBodyInput = z.input<typeof createVariantBodySchema>;

export const updateProductVariantSchema = createProductVariantSchema.partial().omit({ productId: true, sku: true });
export type UpdateProductVariantInput = z.input<typeof updateProductVariantSchema>;
