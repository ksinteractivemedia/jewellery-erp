import { z } from "zod";
import { zId, zPaise } from "./common";

export const createMetalRateSchema = z.object({
  metalId: zId,
  purity: z.string().min(1),
  ratePerGram: zPaise.positive(),
  effectiveFrom: z.coerce.date(),
  source: z.enum(["MANUAL", "FEED"]).default("MANUAL"),
  createdBy: zId.optional(),
});
export type CreateMetalRateInput = z.input<typeof createMetalRateSchema>;

// No update schema — MetalRate is append-only. A correction is a new rate, not an edit.
