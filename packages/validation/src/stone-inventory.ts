import { z } from "zod";
import { zId, zPaise } from "./common";

export const stoneInventoryStatusSchema = z.enum([
  "AVAILABLE",
  "RESERVED",
  "ISSUED_TO_MANUFACTURING",
  "SOLD",
  "RETURNED",
  "DAMAGED",
]);

export const createStoneInventorySchema = z.object({
  stoneId: zId,
  itemCode: z.string().min(1).toUpperCase(),
  shape: z.string().optional(),
  size: z.string().optional(),
  caratWeight: z.number().nonnegative(),
  clarity: z.string().optional(),
  color: z.string().optional(),
  certificateNumber: z.string().optional(),
  certificateAuthority: z.string().optional(),
  cost: zPaise,
  quantity: z.number().int().positive(),
  unit: z.enum(["CARAT", "GRAM", "PIECE"]),
  locationId: zId,
  status: stoneInventoryStatusSchema.default("AVAILABLE"),
});
export type CreateStoneInventoryInput = z.input<typeof createStoneInventorySchema>;

// No generic update schema — status/location/quantity only change via the inventory
// transaction service (business-rules.md §2.1's sibling rule applies to stones too).
export const updateStoneInventoryDetailsSchema = createStoneInventorySchema
  .partial()
  .omit({ stoneId: true, itemCode: true, status: true, locationId: true, quantity: true });
export type UpdateStoneInventoryDetailsInput = z.input<typeof updateStoneInventoryDetailsSchema>;
