import { z } from "zod";

export const purityOptionSchema = z.object({
  code: z.string().min(1),
  fineness: z.number().gt(0).lte(1),
  label: z.string().optional(),
  isActive: z.boolean().default(true),
});
export type PurityOptionInput = z.infer<typeof purityOptionSchema>;

export const createMetalSchema = z.object({
  code: z.string().min(1).toUpperCase(),
  name: z.string().min(1),
  symbol: z.string().optional(),
  purityOptions: z.array(purityOptionSchema).default([]),
  isActive: z.boolean().default(true),
});
export type CreateMetalInput = z.input<typeof createMetalSchema>;

export const updateMetalSchema = createMetalSchema.partial().omit({ code: true });
export type UpdateMetalInput = z.input<typeof updateMetalSchema>;
