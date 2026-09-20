import type { User } from "@jewellery/types";
import { adminUpdateUserSchema, createUserSchema, setUserRolesSchema, type AdminUpdateUserInput, type CreateUserInput, type SetUserRolesInput } from "@jewellery/validation";
import type { AppConfig } from "../../config/app-config";
import { AuthorizationError } from "../../shared/errors";
import { AUDIT_ACTIONS, recordAudit } from "../audit/audit.service";
import type { RequestMeta } from "./auth.service";
import { assertCanGrantRoles, assertCanManageUser, type AuthContext } from "./authorization.service";
import { revokeAllSessionsForUser } from "./session.repository";
import { findUserById, requireUserById, setUserRoleIds, updateUser } from "./user.repository";
import { createUser } from "./user.service";

/**
 * User administration. Holding `settings.manage_users` lets you administer users; it does NOT
 * let you escalate: you can only grant roles whose permissions you hold, only manage users
 * whose permissions you hold, and never change your own roles or deactivate yourself.
 */
export function createUserAdminService(deps: { config: AppConfig }) {
  const audit = (actor: AuthContext, meta: RequestMeta, action: Parameters<typeof recordAudit>[0]["action"], targetId: string, metadata?: Record<string, unknown>) =>
    recordAudit({ action, outcome: "SUCCESS", actorId: actor.userId, actorEmail: actor.email, targetType: "user", targetId, metadata, ip: meta.ip, userAgent: meta.userAgent, requestId: meta.requestId });

  return {
    async createUser(actor: AuthContext, input: CreateUserInput, meta: RequestMeta): Promise<User> {
      const parsed = createUserSchema.parse(input);
      await assertCanGrantRoles(actor, parsed.roleIds);
      const user = await createUser(parsed, deps.config.auth.bcryptRounds);
      await audit(actor, meta, AUDIT_ACTIONS.USER_CREATED, user.id, { email: user.email, userType: user.userType, roleIds: parsed.roleIds });
      return user;
    },

    async updateUser(actor: AuthContext, targetId: string, input: AdminUpdateUserInput, meta: RequestMeta): Promise<User> {
      const patch = adminUpdateUserSchema.parse(input);
      await assertCanManageUser(actor, targetId);
      if (targetId === actor.userId && patch.isActive === false) throw new AuthorizationError("You cannot deactivate your own account");

      const updated = await updateUser(targetId, patch);
      if (patch.isActive === false) {
        const revoked = await revokeAllSessionsForUser(targetId, "USER_DEACTIVATED");
        await audit(actor, meta, AUDIT_ACTIONS.USER_DEACTIVATED, targetId, { sessionsRevoked: revoked });
      } else {
        await audit(actor, meta, AUDIT_ACTIONS.USER_UPDATED, targetId, { fields: Object.keys(patch) });
      }
      return updated;
    },

    async setUserRoles(actor: AuthContext, targetId: string, input: SetUserRolesInput, meta: RequestMeta): Promise<User> {
      const { roleIds } = setUserRolesSchema.parse(input);
      if (targetId === actor.userId) throw new AuthorizationError("You cannot change your own roles");
      await assertCanManageUser(actor, targetId);
      await assertCanGrantRoles(actor, roleIds);
      const before = await requireUserById(targetId);
      const updated = await setUserRoleIds(targetId, roleIds);
      await audit(actor, meta, AUDIT_ACTIONS.USER_ROLES_CHANGED, targetId, { previousRoleIds: before.roleIds, newRoleIds: roleIds });
      return updated;
    },

    async revokeSessions(actor: AuthContext, targetId: string, meta: RequestMeta): Promise<number> {
      await assertCanManageUser(actor, targetId);
      const count = await revokeAllSessionsForUser(targetId, "ADMIN_REVOKED");
      await audit(actor, meta, AUDIT_ACTIONS.USER_SESSIONS_REVOKED, targetId, { sessionsRevoked: count });
      return count;
    },

    getUser: (id: string) => findUserById(id),
  };
}

export type UserAdminService = ReturnType<typeof createUserAdminService>;
