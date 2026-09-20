import { z } from "zod";
import { zId } from "./common";

export const createRoleSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  permissionIds: z.array(zId).default([]),
  isSystem: z.boolean().default(false),
  isActive: z.boolean().default(true),
});
export type CreateRoleInput = z.input<typeof createRoleSchema>;

export const updateRoleSchema = createRoleSchema.partial();
export type UpdateRoleInput = z.input<typeof updateRoleSchema>;
