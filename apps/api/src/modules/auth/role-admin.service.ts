import { ALL_ROLE_NAMES } from "@jewellery/types";
import { customRoleSchema, type CustomRoleInput } from "@jewellery/validation";
import { ConflictError, DomainValidationError, NotFoundError } from "../../shared/errors";
import { AUDIT_ACTIONS, recordAudit } from "../audit/audit.service";
import type { RequestMeta } from "./auth.service";
import { assertHoldsAll, type AuthContext } from "./authorization.service";
import { PermissionModel } from "./permission.model";
import { RoleModel } from "./role.model";

export interface RoleWithPermissions {
  id: string;
  name: string;
  description?: string;
  isSystem: boolean;
  isActive: boolean;
  permissions: string[];
}

async function toRoleWithPermissions(role: InstanceType<typeof RoleModel>): Promise<RoleWithPermissions> {
  const perms = role.permissionIds.length ? await PermissionModel.find({ _id: { $in: role.permissionIds } }).select("key") : [];
  return { id: String(role._id), name: role.name, description: role.description, isSystem: role.isSystem, isActive: role.isActive, permissions: perms.map((p) => p.key).sort() };
}

export async function listRolesWithPermissions(): Promise<RoleWithPermissions[]> {
  const roles = await RoleModel.find().sort({ name: 1 });
  return Promise.all(roles.map(toRoleWithPermissions));
}

export async function listPermissionCatalog() {
  return (await PermissionModel.find().sort({ module: 1, action: 1 })).map((p) => ({ id: String(p._id), key: p.key, module: p.module, action: p.action, description: p.description }));
}

async function resolvePermissionIds(actor: AuthContext, keys: string[]) {
  const unique = [...new Set(keys)];
  const found = await PermissionModel.find({ key: { $in: unique } });
  if (found.length !== unique.length) {
    const missing = unique.filter((k) => !found.some((p) => p.key === k));
    throw new DomainValidationError(`unknown permission(s): ${missing.join(", ")}`);
  }
  // A role editor can't smuggle in a permission they don't hold themselves.
  assertHoldsAll(actor, unique, "assign this role");
  return found.map((p) => p._id);
}

/** Custom roles only. System roles are defined in code (role-matrix.ts) and re-synced at boot, so they are read-only here. */
export function createRoleAdminService() {
  const audit = (actor: AuthContext, meta: RequestMeta, action: typeof AUDIT_ACTIONS.ROLE_CREATED | typeof AUDIT_ACTIONS.ROLE_PERMISSIONS_CHANGED, targetId: string, metadata: Record<string, unknown>) =>
    recordAudit({ action, outcome: "SUCCESS", actorId: actor.userId, actorEmail: actor.email, targetType: "role", targetId, metadata, ip: meta.ip, userAgent: meta.userAgent, requestId: meta.requestId });

  return {
    async createCustomRole(actor: AuthContext, input: CustomRoleInput, meta: RequestMeta): Promise<RoleWithPermissions> {
      const { name, description, permissionKeys } = customRoleSchema.parse(input);
      if ((ALL_ROLE_NAMES as string[]).includes(name.toUpperCase())) throw new ConflictError(`'${name}' is reserved for a system role`);
      const permissionIds = await resolvePermissionIds(actor, permissionKeys);
      const role = await RoleModel.create({ name, description, permissionIds, isSystem: false, isActive: true });
      await audit(actor, meta, AUDIT_ACTIONS.ROLE_CREATED, String(role._id), { name, permissionKeys });
      return toRoleWithPermissions(role);
    },

    async updateCustomRole(actor: AuthContext, id: string, input: CustomRoleInput, meta: RequestMeta): Promise<RoleWithPermissions> {
      const { name, description, permissionKeys } = customRoleSchema.parse(input);
      const role = await RoleModel.findById(id);
      if (!role) throw new NotFoundError("Role", id);
      if (role.isSystem) throw new ConflictError("system roles are defined in code and cannot be edited");
      if ((ALL_ROLE_NAMES as string[]).includes(name.toUpperCase())) throw new ConflictError(`'${name}' is reserved for a system role`);

      const before = (await toRoleWithPermissions(role)).permissions;
      role.name = name;
      role.description = description;
      role.permissionIds = (await resolvePermissionIds(actor, permissionKeys)) as never;
      await role.save();
      await audit(actor, meta, AUDIT_ACTIONS.ROLE_PERMISSIONS_CHANGED, id, { before, after: permissionKeys });
      return toRoleWithPermissions(role);
    },
  };
}

export type RoleAdminService = ReturnType<typeof createRoleAdminService>;
