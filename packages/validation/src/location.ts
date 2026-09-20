import { z } from "zod";
import { zId } from "./common";

export const locationTypeSchema = z.enum([
  "STORE",
  "WAREHOUSE",
  "COUNTER",
  "VAULT",
  "JOB_WORKER",
  "HALLMARKING_CENTER",
  "REPAIR_CENTER",
  "IN_TRANSIT_VIRTUAL",
]);

export const createLocationSchema = z.object({
  branchId: zId,
  name: z.string().min(1),
  code: z.string().min(1).toUpperCase(),
  type: locationTypeSchema,
  isActive: z.boolean().default(true),
});
export type CreateLocationInput = z.input<typeof createLocationSchema>;

export const updateLocationSchema = createLocationSchema.partial().omit({ branchId: true });
export type UpdateLocationInput = z.input<typeof updateLocationSchema>;
