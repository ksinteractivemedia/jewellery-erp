import { z } from "zod";
import { zAddress, zId } from "./common";

const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export const createBranchSchema = z.object({
  companyId: zId,
  name: z.string().min(1),
  code: z.string().min(1).toUpperCase(),
  gstin: z.string().regex(gstinRegex, "must be a valid GSTIN").optional(),
  address: zAddress,
  contactPhone: z.string().optional(),
  isActive: z.boolean().default(true),
});
export type CreateBranchInput = z.input<typeof createBranchSchema>;

export const updateBranchSchema = createBranchSchema.partial().omit({ companyId: true });
export type UpdateBranchInput = z.input<typeof updateBranchSchema>;
