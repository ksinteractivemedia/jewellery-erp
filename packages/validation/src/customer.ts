import { z } from "zod";
import { zAddress, zCustomerType, zId } from "./common";
import { b2bContactSchema } from "./b2b";

/** The wholesale account terms. Outstanding and overdue are never stored — they are derived from invoices and payment allocations. */
export const b2bProfileSchema = z.object({
  contacts: z.array(b2bContactSchema).max(10).default([]),
  creditLimit: z.number().int().min(0).default(0),
  paymentTermsDays: z.number().int().min(0).max(365).default(30),
  priceListCode: z.string().trim().min(1).max(40).optional(),
  salespersonId: zId.optional(),
  territory: z.string().trim().min(1).max(60).optional(),
  creditHold: z.boolean().default(false),
  blockOnOverdue: z.boolean().default(false),
});

const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export const createCustomerSchema = z
  .object({
    type: zCustomerType,
    name: z.string().min(1),
    email: z.string().email().optional(),
    phone: z.string().min(6).optional(),
    gstin: z.string().regex(gstinRegex, "must be a valid GSTIN").optional(),
    customerGroupId: zId.optional(),
    billingAddress: zAddress.optional(),
    shippingAddresses: z.array(zAddress).default([]),
    channelUserId: zId.optional(),
    b2b: b2bProfileSchema.optional(),
    isActive: z.boolean().default(true),
  })
  .refine((data) => !!data.email || !!data.phone, {
    message: "at least one of email or phone is required",
    path: ["email"],
  });
export type CreateCustomerInput = z.input<typeof createCustomerSchema>;

export const updateCustomerSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  phone: z.string().min(6).optional(),
  gstin: z.string().regex(gstinRegex).optional(),
  customerGroupId: zId.optional(),
  billingAddress: zAddress.optional(),
  shippingAddresses: z.array(zAddress).optional(),
  isActive: z.boolean().optional(),
});
export type UpdateCustomerInput = z.input<typeof updateCustomerSchema>;
