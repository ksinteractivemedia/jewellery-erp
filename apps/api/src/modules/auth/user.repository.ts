import type { User } from "@jewellery/types";
import { updateUserSchema, type UpdateUserInput } from "@jewellery/validation";
import { NotFoundError } from "../../shared/errors";
import { toDTO, toDTOList } from "../../shared/to-dto";
import { UserModel, type UserAttrs } from "./user.model";

/** Internal — never returned by anything a controller layer will expose. */
export async function createUserRecord(attrs: UserAttrs) {
  return UserModel.create(attrs);
}

export async function findUserWithCredentialsByEmail(email: string) {
  return UserModel.findOne({ email: email.toLowerCase() });
}

export async function findUserById(id: string): Promise<User | null> {
  return toDTO<User>(await UserModel.findById(id).select("-passwordHash"));
}

export async function requireUserById(id: string): Promise<User> {
  const user = await findUserById(id);
  if (!user) throw new NotFoundError("User", id);
  return user;
}

export async function listUsers(filter: { userType?: string; branchId?: string; isActive?: boolean } = {}): Promise<User[]> {
  return toDTOList<User>(await UserModel.find(filter).select("-passwordHash").sort({ name: 1 }));
}

export async function updateUser(id: string, input: UpdateUserInput): Promise<User> {
  const parsed = updateUserSchema.parse(input);
  const doc = await UserModel.findByIdAndUpdate(id, parsed, { new: true, runValidators: true }).select("-passwordHash");
  if (!doc) throw new NotFoundError("User", id);
  return toDTO<User>(doc)!;
}

export async function setPasswordHash(id: string, passwordHash: string): Promise<void> {
  const result = await UserModel.updateOne({ _id: id }, { passwordHash });
  if (result.matchedCount === 0) throw new NotFoundError("User", id);
}

export async function recordLogin(id: string): Promise<void> {
  await UserModel.updateOne({ _id: id }, { lastLoginAt: new Date() });
}
