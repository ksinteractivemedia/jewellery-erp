import { z } from "zod";

/**
 * One password policy for every place a password is set (create user, reset, change).
 * The 72-byte cap is bcrypt's hard input limit — anything longer would be silently truncated,
 * so it's rejected instead. Login deliberately does NOT apply this policy, so tightening
 * it later never locks out existing users.
 */
export const passwordSchema = z
  .string()
  .min(10, "password must be at least 10 characters")
  .refine((v) => new TextEncoder().encode(v).length <= 72, "password must be at most 72 bytes")
  .refine((v) => /[A-Za-z]/.test(v) && /\d/.test(v), "password must contain a letter and a digit");

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(1024),
});
export type LoginInput = z.input<typeof loginSchema>;

export const forgotPasswordSchema = z.object({ email: z.string().trim().toLowerCase().email() });
export type ForgotPasswordInput = z.input<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({
  token: z.string().min(20).max(200),
  newPassword: passwordSchema,
});
export type ResetPasswordInput = z.input<typeof resetPasswordSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(1024),
  newPassword: passwordSchema,
});
export type ChangePasswordInput = z.input<typeof changePasswordSchema>;
