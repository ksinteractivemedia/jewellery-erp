import type { Types } from "mongoose";
import type { AuthUser, PermissionKey, UserType } from "@jewellery/types";
import { AuthorizationError, DomainValidationError, NotFoundError } from "../../shared/errors";
import { PermissionModel } from "./permission.model";
import { RoleModel } from "./role.model";
import { UserModel } from "./user.model";

/** Everything the API knows about "who is calling", resolved fresh from the database on every request. */
export interface AuthContext {
  userId: string;
  sessionId: string;
  name: string;
  email?: string;
  userType: UserType;
  roles: { id: string; name: string }[];
  permissions: ReadonlySet<string>;
}

type IdLike = Types.ObjectId | string;

/**
 * Union of the permissions of the given roles. An inactive role contributes nothing — a role
 * can be switched off centrally without touching every user that holds it.
 */
export async function resolveRolesAndPermissions(roleIds: IdLike[]): Promise<{ roles: { id: string; name: string }[]; permissions: Set<string> }> {
  if (roleIds.length === 0) return { roles: [], permissions: new Set() };
  const roles = await RoleModel.find({ _id: { $in: roleIds }, isActive: true });
  const permissionIds = [...new Set(roles.flatMap((r) => r.permissionIds.map(String)))];
  const permissions = permissionIds.length ? await PermissionModel.find({ _id: { $in: permissionIds } }).select("key") : [];
  return {
    roles: roles.map((r) => ({ id: String(r._id), name: r.name })),
    permissions: new Set(permissions.map((p) => p.key)),
  };
}

export function toAuthUser(ctx: Pick<AuthContext, "userId" | "name" | "email" | "userType" | "roles" | "permissions">): AuthUser {
  return {
    id: ctx.userId,
    name: ctx.name,
    email: ctx.email,
    userType: ctx.userType,
    roles: ctx.roles.map((r) => r.name).sort(),
    permissions: [...ctx.permissions].sort() as PermissionKey[],
  };
}

// ---------------------------------------------------------------------------------------------
// Policies — small composable predicates. Controllers never mention a role name; they compose these.
// ---------------------------------------------------------------------------------------------

export type Policy<Req = unknown> = (ctx: AuthContext, req: Req) => boolean | Promise<boolean>;

export const hasAll = (...keys: PermissionKey[]): Policy => (ctx) => keys.every((k) => ctx.permissions.has(k));
export const hasAny = (...keys: PermissionKey[]): Policy => (ctx) => keys.some((k) => ctx.permissions.has(k));

// ---------------------------------------------------------------------------------------------
// Privilege-escalation rules. Both are expressed purely in terms of permissions, not role names:
//   1. You can only grant a role whose permissions you already hold.
//   2. You can only manage a user whose effective permissions you already hold.
// ---------------------------------------------------------------------------------------------

/** Loads roles for assignment: they must exist and be active. */
async function loadAssignableRoles(roleIds: string[]) {
  const unique = [...new Set(roleIds)];
  const roles = await RoleModel.find({ _id: { $in: unique } });
  if (roles.length !== unique.length) throw new DomainValidationError("one or more roles do not exist");
  const inactive = roles.filter((r) => !r.isActive);
  if (inactive.length) throw new DomainValidationError(`role '${inactive[0].name}' is inactive and cannot be assigned`);
  return roles;
}

async function permissionKeysForIds(ids: IdLike[]): Promise<string[]> {
  if (!ids.length) return [];
  return (await PermissionModel.find({ _id: { $in: ids } }).select("key")).map((p) => p.key);
}

export function assertHoldsAll(actor: AuthContext, keys: Iterable<string>, what: string): void {
  const missing = [...keys].filter((k) => !actor.permissions.has(k));
  if (missing.length) throw new AuthorizationError(`You cannot ${what} because it includes permissions you do not hold`);
}

export async function assertCanGrantRoles(actor: AuthContext, roleIds: string[]): Promise<void> {
  const roles = await loadAssignableRoles(roleIds);
  for (const role of roles) {
    assertHoldsAll(actor, await permissionKeysForIds(role.permissionIds), `grant the '${role.name}' role`);
  }
}

export async function assertCanManageUser(actor: AuthContext, targetUserId: string): Promise<void> {
  const target = await UserModel.findById(targetUserId);
  if (!target) throw new NotFoundError("User", targetUserId);
  const { permissions } = await resolveRolesAndPermissions(target.roleIds);
  assertHoldsAll(actor, permissions, "manage this user");
}
