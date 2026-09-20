import { z } from "zod";
import { zId } from "./common";
import { zSlug } from "./slug";

export const createProductCategorySchema = z.object({
  name: z.string().trim().min(1).max(120),
  /** Optional on create — derived from the name when omitted. */
  slug: zSlug.optional(),
  description: z.string().trim().max(1000).optional(),
  parentId: zId.optional(),
  isActive: z.boolean().default(true),
});
export type CreateProductCategoryInput = z.input<typeof createProductCategorySchema>;

/** `parentId: null` moves a category to the top level; `description: null` clears it. */
export const updateProductCategorySchema = createProductCategorySchema.partial().extend({
  parentId: zId.nullable().optional(),
  description: z.string().trim().max(1000).nullable().optional(),
});
export type UpdateProductCategoryInput = z.input<typeof updateProductCategorySchema>;
