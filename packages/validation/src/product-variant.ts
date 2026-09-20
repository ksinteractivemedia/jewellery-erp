import { z } from "zod";
import { zGrams, zId } from "./common";

export const createProductVariantSchema = z.object({
  productId: zId,
  sku: z.string().min(1).toUpperCase(),
  attributes: z.record(z.string()).default({}),
  defaultGrossWeight: zGrams.optional(),
  defaultNetWeight: zGrams.optional(),
  images: z.array(z.string()).default([]),
  isActive: z.boolean().default(true),
});
export type CreateProductVariantInput = z.input<typeof createProductVariantSchema>;

export const updateProductVariantSchema = createProductVariantSchema.partial().omit({ productId: true, sku: true });
export type UpdateProductVariantInput = z.input<typeof updateProductVariantSchema>;
