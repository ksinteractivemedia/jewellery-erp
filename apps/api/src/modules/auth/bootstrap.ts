import { ROLE_NAMES } from "@jewellery/types";
import { ConflictError } from "../../shared/errors";
import { RoleModel } from "./role.model";
import { UserModel } from "./user.model";
import { createUser } from "./user.service";
import { syncRbac } from "./rbac/rbac-sync";

/**
 * Creates the first SUPER_ADMIN. Refuses if one already exists, so it can't be used as a
 * back door later. This is the only path that grants a role without an acting admin.
 */
export async function bootstrapSuperAdmin(input: { email: string; name: string; password: string }, rounds?: number) {
  await syncRbac();
  const role = await RoleModel.findOne({ name: ROLE_NAMES.SUPER_ADMIN });
  if (!role) throw new Error("SUPER_ADMIN role missing after syncRbac");
  if (await UserModel.exists({ roleIds: role._id })) throw new ConflictError("a SUPER_ADMIN already exists");
  return createUser({ email: input.email, name: input.name, password: input.password, userType: "STAFF", roleIds: [String(role._id)] }, rounds);
}
