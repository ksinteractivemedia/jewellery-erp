import { z } from "zod";
import { zAddress } from "./common";

const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export const createCompanySchema = z.object({
  name: z.string().min(1),
  legalName: z.string().min(1),
  gstin: z.string().regex(gstinRegex, "must be a valid GSTIN").optional(),
  pan: z.string().optional(),
  address: zAddress,
  contactEmail: z.string().email().optional(),
  contactPhone: z.string().optional(),
  isActive: z.boolean().default(true),
});
export type CreateCompanyInput = z.input<typeof createCompanySchema>;

export const updateCompanySchema = createCompanySchema.partial();
export type UpdateCompanyInput = z.input<typeof updateCompanySchema>;
