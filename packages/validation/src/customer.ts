import { z } from "zod";
import { zAddress, zCustomerType, zId } from "./common";

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
