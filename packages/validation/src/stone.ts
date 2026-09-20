import { z } from "zod";

export const createStoneSchema = z.object({
  name: z.string().min(1),
  category: z.enum(["PRECIOUS", "SEMI_PRECIOUS", "ORGANIC"]),
  defaultUnit: z.enum(["CARAT", "GRAM", "PIECE"]),
  isActive: z.boolean().default(true),
});
export type CreateStoneInput = z.input<typeof createStoneSchema>;

export const updateStoneSchema = createStoneSchema.partial();
export type UpdateStoneInput = z.input<typeof updateStoneSchema>;
