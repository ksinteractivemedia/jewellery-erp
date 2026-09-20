import { z } from "zod";
import { zChannel, zId } from "./common";

export const createPriceListSchema = z
  .object({
    code: z.string().min(1).toUpperCase(),
    name: z.string().min(1),
    customerGroupId: zId.optional(),
    customerId: zId.optional(),
    channel: z.union([zChannel, z.literal("BOTH")]).default("BOTH"),
    effectiveFrom: z.coerce.date(),
    effectiveTo: z.coerce.date().optional(),
    isActive: z.boolean().default(true),
  })
  .refine((data) => !data.effectiveTo || data.effectiveTo > data.effectiveFrom, {
    message: "effectiveTo must be after effectiveFrom",
    path: ["effectiveTo"],
  });
export type CreatePriceListInput = z.input<typeof createPriceListSchema>;

// No update schema for the versioned fields — see price-list.repository.ts `createNewVersion`.
// Only non-versioned metadata (name) is ever edited in place on the current version.
export const renamePriceListSchema = z.object({ name: z.string().min(1) });
export type RenamePriceListInput = z.input<typeof renamePriceListSchema>;
