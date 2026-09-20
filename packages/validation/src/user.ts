import { z } from "zod";
import { zId } from "./common";
import { passwordSchema } from "./auth";

export const userTypeSchema = z.enum(["STAFF", "B2B_BUYER", "B2C_CUSTOMER"]);

/** Takes a plain `password` — hashing happens in the user service, never in a controller. */
export const createUserSchema = z
  .object({
    email: z.string().email().optional(),
    phone: z.string().min(6).optional(),
    name: z.string().min(1),
    password: passwordSchema,
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

/** Admin-facing profile patch. Roles are deliberately NOT here — see setUserRolesSchema. */
export const adminUpdateUserSchema = z.object({
  name: z.string().min(1).optional(),
  phone: z.string().min(6).optional(),
  branchId: zId.optional(),
  isActive: z.boolean().optional(),
});
export type AdminUpdateUserInput = z.input<typeof adminUpdateUserSchema>;

export const setUserRolesSchema = z.object({ roleIds: z.array(zId).max(20) });
export type SetUserRolesInput = z.input<typeof setUserRolesSchema>;
