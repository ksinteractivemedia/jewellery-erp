import { Router, type RequestHandler } from "express";
import { PERMISSIONS } from "@jewellery/types";
import { zId } from "@jewellery/validation";
import type { RoleAdminService } from "../../modules/auth/role-admin.service";
import { listPermissionCatalog, listRolesWithPermissions } from "../../modules/auth/role-admin.service";
import { asyncHandler } from "../middleware/async-handler";
import { requireAnyPermission, requirePermission } from "../middleware/authorize";

export function createRolesRouter(deps: { authenticate: RequestHandler; roleAdmin: RoleAdminService }) {
  const router = Router();
  // Needed to populate a role picker, so either user- or role-management is enough to read.
  const canRead = requireAnyPermission(PERMISSIONS.SETTINGS_MANAGE_USERS, PERMISSIONS.SETTINGS_MANAGE_ROLES);

  router.get("/roles", deps.authenticate, canRead, asyncHandler(async (_req, res) => {
    res.json({ roles: await listRolesWithPermissions() });
  }));

  router.get("/permissions", deps.authenticate, canRead, asyncHandler(async (_req, res) => {
    res.json({ permissions: await listPermissionCatalog() });
  }));

  router.post("/roles", deps.authenticate, requirePermission(PERMISSIONS.SETTINGS_MANAGE_ROLES), asyncHandler(async (req, res) => {
    res.status(201).json({ role: await deps.roleAdmin.createCustomRole(req.auth!, req.body, req.ctx) });
  }));

  router.put("/roles/:id", deps.authenticate, requirePermission(PERMISSIONS.SETTINGS_MANAGE_ROLES), asyncHandler(async (req, res) => {
    res.json({ role: await deps.roleAdmin.updateCustomRole(req.auth!, zId.parse(req.params.id), req.body, req.ctx) });
  }));

  return router;
}
