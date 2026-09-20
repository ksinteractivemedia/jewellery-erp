import bcrypt from "bcryptjs";
import type { User } from "@jewellery/types";
import { changePasswordSchema, createUserSchema, type ChangePasswordInput, type CreateUserInput } from "@jewellery/validation";
import { deepStringifyObjectIds } from "../../shared/to-dto";
import { AppError } from "../../shared/errors";
import { createUserRecord, findUserWithCredentialsByEmail, setPasswordHash } from "./user.repository";
import type { UserAttrs } from "./user.model";

const SALT_ROUNDS = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/** Hashes the password and persists the user — the only sanctioned way to create one. */
export async function createUser(input: CreateUserInput): Promise<User> {
  const parsed = createUserSchema.parse(input);
  const { password, ...rest } = parsed;
  const passwordHash = await hashPassword(password);
  const doc = await createUserRecord({ ...rest, passwordHash } as unknown as UserAttrs);
  const { passwordHash: _omit, ...safe } = doc.toObject();
  return deepStringifyObjectIds(safe) as unknown as User;
}

export async function verifyCredentials(email: string, password: string): Promise<User | null> {
  const doc = await findUserWithCredentialsByEmail(email);
  if (!doc || !doc.isActive) return null;
  const ok = await verifyPassword(password, doc.passwordHash);
  if (!ok) return null;
  const { passwordHash: _omit, ...safe } = doc.toObject();
  return deepStringifyObjectIds(safe) as unknown as User;
}

export async function changePassword(userId: string, email: string, input: ChangePasswordInput): Promise<void> {
  const parsed = changePasswordSchema.parse(input);
  const doc = await findUserWithCredentialsByEmail(email);
  if (!doc) throw new AppError("user not found", "NOT_FOUND");
  const ok = await verifyPassword(parsed.currentPassword, doc.passwordHash);
  if (!ok) throw new AppError("current password is incorrect", "INVALID_CREDENTIALS");
  await setPasswordHash(userId, await hashPassword(parsed.newPassword));
}
