import { Router, type RequestHandler } from "express";
import { PERMISSIONS } from "@jewellery/types";
import { zId } from "@jewellery/validation";
import type { UserAdminService } from "../../modules/auth/user-admin.service";
import { listUsers } from "../../modules/auth/user.repository";
import { asyncHandler } from "../middleware/async-handler";
import { requirePermission } from "../middleware/authorize";
import { NotFoundError } from "../../shared/errors";

export function createUsersRouter(deps: { authenticate: RequestHandler; userAdmin: UserAdminService }) {
  const router = Router();
  router.use(deps.authenticate, requirePermission(PERMISSIONS.SETTINGS_MANAGE_USERS));

  router.get("/", asyncHandler(async (req, res) => {
    const { userType, isActive } = req.query;
    res.json({
      users: await listUsers({
        userType: typeof userType === "string" ? userType : undefined,
        isActive: isActive === undefined ? undefined : isActive === "true",
      }),
    });
  }));

  router.post("/", asyncHandler(async (req, res) => {
    res.status(201).json({ user: await deps.userAdmin.createUser(req.auth!, req.body, req.ctx) });
  }));

  router.get("/:id", asyncHandler(async (req, res) => {
    const id = zId.parse(req.params.id);
    const user = await deps.userAdmin.getUser(id);
    if (!user) throw new NotFoundError("User", id);
    res.json({ user });
  }));

  router.patch("/:id", asyncHandler(async (req, res) => {
    res.json({ user: await deps.userAdmin.updateUser(req.auth!, zId.parse(req.params.id), req.body, req.ctx) });
  }));

  router.put("/:id/roles", asyncHandler(async (req, res) => {
    res.json({ user: await deps.userAdmin.setUserRoles(req.auth!, zId.parse(req.params.id), req.body, req.ctx) });
  }));

  router.post("/:id/revoke-sessions", asyncHandler(async (req, res) => {
    res.json({ sessionsRevoked: await deps.userAdmin.revokeSessions(req.auth!, zId.parse(req.params.id), req.ctx) });
  }));

  return router;
}
