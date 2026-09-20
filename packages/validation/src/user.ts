import { z } from "zod";
import { zId } from "./common";

export const userTypeSchema = z.enum(["STAFF", "B2B_BUYER", "B2C_CUSTOMER"]);

/** Takes a plain `password` — hashing happens in the user service, never in a controller. */
export const createUserSchema = z
  .object({
    email: z.string().email().optional(),
    phone: z.string().min(6).optional(),
    name: z.string().min(1),
    password: z.string().min(8),
    userType: userTypeSchema,
    roleIds: z.array(zId).default([]),
    customerId: zId.optional(),
    branchId: zId.optional(),
    isActive: z.boolean().default(true),
  })
  .refine((data) => !!data.email || !!data.phone, {
    message: "at least one of email or phone is required",
    path: ["email"],
  });
export type CreateUserInput = z.input<typeof createUserSchema>;

export const updateUserSchema = z.object({
  email: z.string().email().optional(),
  phone: z.string().min(6).optional(),
  name: z.string().min(1).optional(),
  roleIds: z.array(zId).optional(),
  branchId: zId.optional(),
  isActive: z.boolean().optional(),
});
export type UpdateUserInput = z.input<typeof updateUserSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(8),
  newPassword: z.string().min(8),
});
export type ChangePasswordInput = z.input<typeof changePasswordSchema>;
