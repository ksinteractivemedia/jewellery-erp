import { z } from "zod";

export const createCustomerGroupSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  isActive: z.boolean().default(true),
});
export type CreateCustomerGroupInput = z.input<typeof createCustomerGroupSchema>;

export const updateCustomerGroupSchema = createCustomerGroupSchema.partial();
export type UpdateCustomerGroupInput = z.input<typeof updateCustomerGroupSchema>;
