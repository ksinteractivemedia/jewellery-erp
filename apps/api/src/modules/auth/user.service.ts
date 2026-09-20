import bcrypt from "bcryptjs";
import type { User } from "@jewellery/types";
import { createUserSchema, type CreateUserInput } from "@jewellery/validation";
import { createUserRecord, toSafeUser } from "./user.repository";
import type { UserAttrs } from "./user.model";

/** Cost factor is read per call so tests can lower it (BCRYPT_ROUNDS) without a slow suite; production default is 12. */
export function defaultBcryptRounds(): number {
  return Number(process.env.BCRYPT_ROUNDS ?? 12);
}

export async function hashPassword(plain: string, rounds = defaultBcryptRounds()): Promise<string> {
  return bcrypt.hash(plain, rounds);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/**
 * Hashes the password and persists the user — the only sanctioned way to create one.
 * Authorization (who may create which user / grant which roles) is enforced one layer up in
 * user-admin.service.ts; this function trusts its caller.
 */
export async function createUser(input: CreateUserInput, rounds = defaultBcryptRounds()): Promise<User> {
  const parsed = createUserSchema.parse(input);
  const { password, ...rest } = parsed;
  const passwordHash = await hashPassword(password, rounds);
  const doc = await createUserRecord({ ...rest, passwordHash, passwordChangedAt: new Date() } as unknown as Partial<UserAttrs>);
  return toSafeUser(doc);
}
