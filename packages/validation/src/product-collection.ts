import { z } from "zod";
import { zSlug } from "./slug";

export const createProductCollectionSchema = z.object({
  name: z.string().trim().min(1).max(120),
  slug: zSlug.optional(),
  description: z.string().trim().max(1000).optional(),
  isActive: z.boolean().default(true),
});
export type CreateProductCollectionInput = z.input<typeof createProductCollectionSchema>;

export const updateProductCollectionSchema = createProductCollectionSchema.partial().extend({
  description: z.string().trim().max(1000).nullable().optional(),
});
export type UpdateProductCollectionInput = z.input<typeof updateProductCollectionSchema>;
