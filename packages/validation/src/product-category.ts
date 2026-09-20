import { z } from "zod";
import { zId } from "./common";

export const createProductCategorySchema = z.object({
  name: z.string().min(1),
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-]+$/, "slug must be lowercase, alphanumeric and hyphens only"),
  parentId: zId.optional(),
  isActive: z.boolean().default(true),
});
export type CreateProductCategoryInput = z.input<typeof createProductCategorySchema>;

export const updateProductCategorySchema = createProductCategorySchema.partial();
export type UpdateProductCategoryInput = z.input<typeof updateProductCategorySchema>;
