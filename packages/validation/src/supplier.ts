import { z } from "zod";
import { zAddress } from "./common";

const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export const createSupplierSchema = z.object({
  name: z.string().min(1),
  gstin: z.string().regex(gstinRegex, "must be a valid GSTIN").optional(),
  contactName: z.string().optional(),
  contactEmail: z.string().email().optional(),
  contactPhone: z.string().optional(),
  address: zAddress.optional(),
  paymentTermsDays: z.number().int().nonnegative().default(0),
  isActive: z.boolean().default(true),
});
export type CreateSupplierInput = z.input<typeof createSupplierSchema>;

export const updateSupplierSchema = createSupplierSchema.partial();
export type UpdateSupplierInput = z.input<typeof updateSupplierSchema>;
