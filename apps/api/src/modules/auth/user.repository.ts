import type { ClientSession } from "mongoose";
import type { User } from "@jewellery/types";
import { updateUserSchema, type UpdateUserInput } from "@jewellery/validation";
import { NotFoundError } from "../../shared/errors";
import { deepStringifyObjectIds, toDTOList } from "../../shared/to-dto";
import { UserModel, type UserAttrs, type UserDocument } from "./user.model";

/** Fields that must never leave the auth layer. Every read that produces a `User` DTO excludes them. */
const INTERNAL_FIELDS = "-passwordHash -failedLoginAttempts -lockedUntil -passwordChangedAt";

/** Converts a hydrated user to the safe `User` DTO — strips credentials/lockout state, stringifies ids. */
export function toSafeUser(doc: UserDocument): User {
  const { passwordHash: _h, failedLoginAttempts: _f, lockedUntil: _l, passwordChangedAt: _p, ...safe } = doc.toObject() as unknown as Record<string, unknown>;
  return deepStringifyObjectIds(safe) as unknown as User;
}

/** Internal — never returned by anything a controller layer will expose. */
export async function createUserRecord(attrs: Partial<UserAttrs>) {
  return UserModel.create(attrs);
}

/** Returns the full document *including* passwordHash. Callers must not serialize it. */
export async function findUserWithCredentialsByEmail(email: string) {
  return UserModel.findOne({ email: email.trim().toLowerCase() });
}

export async function findUserWithCredentialsById(id: string) {
  return UserModel.findById(id);
}

export async function findUserById(id: string): Promise<User | null> {
  const doc = await UserModel.findById(id).select(INTERNAL_FIELDS);
  return doc ? toSafeUser(doc) : null;
}

export async function requireUserById(id: string): Promise<User> {
  const user = await findUserById(id);
  if (!user) throw new NotFoundError("User", id);
  return user;
}

export async function listUsers(filter: { userType?: string; branchId?: string; isActive?: boolean } = {}): Promise<User[]> {
  const docs = await UserModel.find(filter).select(INTERNAL_FIELDS).sort({ name: 1 });
  return toDTOList<User>(docs);
}

export async function updateUser(id: string, input: UpdateUserInput): Promise<User> {
  const parsed = updateUserSchema.parse(input);
  const doc = await UserModel.findByIdAndUpdate(id, parsed, { new: true, runValidators: true }).select(INTERNAL_FIELDS);
  if (!doc) throw new NotFoundError("User", id);
  return toSafeUser(doc);
}

export async function setUserRoleIds(id: string, roleIds: string[]): Promise<User> {
  const doc = await UserModel.findByIdAndUpdate(id, { roleIds }, { new: true }).select(INTERNAL_FIELDS);
  if (!doc) throw new NotFoundError("User", id);
  return toSafeUser(doc);
}

export async function setPasswordHash(id: string, passwordHash: string, session?: ClientSession): Promise<void> {
  const result = await UserModel.updateOne(
    { _id: id },
    { passwordHash, passwordChangedAt: new Date(), failedLoginAttempts: 0, $unset: { lockedUntil: 1 } },
    { session }
  );
  if (result.matchedCount === 0) throw new NotFoundError("User", id);
}

export async function recordLogin(id: string): Promise<void> {
  await UserModel.updateOne({ _id: id }, { lastLoginAt: new Date(), failedLoginAttempts: 0, $unset: { lockedUntil: 1 } });
}

/** Atomically counts a failed login and locks the account once the threshold is hit. Returns whether it is now locked. */
export async function registerFailedLogin(id: string, maxFailed: number, lockoutMinutes: number): Promise<boolean> {
  const updated = await UserModel.findByIdAndUpdate(id, { $inc: { failedLoginAttempts: 1 } }, { new: true });
  if (!updated || updated.failedLoginAttempts < maxFailed) return false;
  await UserModel.updateOne({ _id: id }, { failedLoginAttempts: 0, lockedUntil: new Date(Date.now() + lockoutMinutes * 60_000) });
  return true;
}
