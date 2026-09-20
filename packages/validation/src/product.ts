import { z } from "zod";
import { zChannelVisibility, zGrams, zId, zStoneDetail } from "./common";

export const productStatusSchema = z.enum(["DRAFT", "ACTIVE", "DISCONTINUED"]);

export const createProductSchema = z.object({
  sku: z.string().min(1).toUpperCase(),
  name: z.string().min(1),
  description: z.string().optional(),
  images: z.array(z.string()).default([]),
  categoryId: zId.optional(),
  metalId: zId,
  defaultPurity: z.string().optional(),
  defaultGrossWeight: zGrams.optional(),
  defaultNetWeight: zGrams.optional(),
  stoneDetails: z.array(zStoneDetail).default([]),
  status: productStatusSchema.default("DRAFT"),
  channelVisibility: zChannelVisibility.default("BOTH"),
  hasVariants: z.boolean().default(false),
});
export type CreateProductInput = z.input<typeof createProductSchema>;

export const updateProductSchema = createProductSchema.partial().omit({ sku: true });
export type UpdateProductInput = z.input<typeof updateProductSchema>;
