import { z } from "zod";

export const createPermissionSchema = z.object({
  key: z
    .string()
    .regex(/^[a-z0-9_]+:[a-z0-9_]+$/, "key must look like 'module:action'"),
  module: z.string().min(1),
  action: z.string().min(1),
  description: z.string().optional(),
});
export type CreatePermissionInput = z.input<typeof createPermissionSchema>;

export const updatePermissionSchema = createPermissionSchema.partial();
export type UpdatePermissionInput = z.input<typeof updatePermissionSchema>;
