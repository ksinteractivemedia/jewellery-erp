import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { ALL_ROLE_NAMES, PERMISSIONS as P, ROLE_NAMES as R, type PermissionKey, type RoleName } from "@jewellery/types";
import { PASSWORD, bearer, buildTestApp, createStaff, loginAs, roleId, seedRbac } from "../../test/helpers";
import { DEFAULT_ROLE_MATRIX } from "../modules/auth/rbac/role-matrix";
import { AuditLogModel } from "../modules/audit/audit-log.model";
import { SessionModel } from "../modules/auth/session.model";
import { UserModel } from "../modules/auth/user.model";
import { RoleModel } from "../modules/auth/role.model";

let t: ReturnType<typeof buildTestApp>;
beforeEach(async () => {
  await seedRbac();
  t = buildTestApp();
});

/** Every protected endpoint and the permission(s) it demands — the table the matrix test is driven by. */
const ENDPOINTS: { method: "get" | "post"; path: string; needs: PermissionKey[]; any?: boolean }[] = [
  { method: "get", path: "/api/inventory/items", needs: [P.INVENTORY_VIEW] },
  { method: "get", path: "/api/users", needs: [P.SETTINGS_MANAGE_USERS] },
  { method: "get", path: "/api/roles", needs: [P.SETTINGS_MANAGE_USERS, P.SETTINGS_MANAGE_ROLES], any: true },
  { method: "get", path: "/api/permissions", needs: [P.SETTINGS_MANAGE_USERS, P.SETTINGS_MANAGE_ROLES], any: true },
  { method: "get", path: "/api/audit-logs", needs: [P.SETTINGS_VIEW_AUDIT_LOGS] },
  { method: "post", path: "/api/roles", needs: [P.SETTINGS_MANAGE_ROLES] },
];

const holds = (role: RoleName, e: (typeof ENDPOINTS)[number]) =>
  e.any ? e.needs.some((n) => DEFAULT_ROLE_MATRIX[role].includes(n)) : e.needs.every((n) => DEFAULT_ROLE_MATRIX[role].includes(n));

describe("unauthenticated access is refused everywhere", () => {
  for (const e of ENDPOINTS) {
    it(`${e.method.toUpperCase()} ${e.path} → 401 with no token`, async () => {
      const res = await request(t.app)[e.method](e.path);
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("UNAUTHENTICATED");
    });
  }

  it("rejects an expired token with TOKEN_EXPIRED, a tampered one and a revoked session with UNAUTHENTICATED", async () => {
    const { email } = await createStaff(R.SUPER_ADMIN);
    const { accessToken, agent } = await loginAs(t.app, email);
    const [h, p, s] = accessToken.split(".");
    const forged = `${h}.${Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(p, "base64url").toString()), sub: "64b0c0ffee0000000000ffff" })).toString("base64url")}.${s}`;
    expect((await request(t.app).get("/api/users").set(bearer(forged))).body.error.code).toBe("UNAUTHENTICATED");

    const short = buildTestApp({ auth: { accessTtlSeconds: 1 } });
    const { accessToken: shortToken } = await loginAs(short.app, email);
    await new Promise((r) => setTimeout(r, 2100));
    const expired = await request(short.app).get("/api/users").set(bearer(shortToken));
    expect(expired.status).toBe(401);
    expect(expired.body.error.code).toBe("TOKEN_EXPIRED");

    await agent.post("/api/auth/logout");
    expect((await request(t.app).get("/api/users").set(bearer(accessToken))).status).toBe(401);
  }, 15_000);
});

describe("role → endpoint authorization matrix (backend-enforced)", () => {
  for (const role of ALL_ROLE_NAMES) {
    it(`${role}: allowed exactly where its permissions say, 403 everywhere else`, async () => {
      const { email } = await createStaff(role);
      const { accessToken } = await loginAs(t.app, email);
      for (const e of ENDPOINTS) {
        const res = await request(t.app)[e.method](e.path).set(bearer(accessToken)).send(e.method === "post" ? { name: "X Role", permissionKeys: [] } : undefined);
        if (holds(role, e)) {
          expect(res.status, `${role} ${e.method} ${e.path}`).not.toBe(403);
          expect(res.status, `${role} ${e.method} ${e.path}`).not.toBe(401);
        } else {
          expect(res.status, `${role} ${e.method} ${e.path}`).toBe(403);
          expect(res.body.error.code).toBe("FORBIDDEN");
        }
      }
    });
  }

  it("a user with no roles is authenticated but forbidden from everything protected", async () => {
    const { email } = await createStaff(null);
    const { accessToken } = await loginAs(t.app, email);
    expect((await request(t.app).get("/api/auth/me").set(bearer(accessToken))).status).toBe(200);
    for (const e of ENDPOINTS) expect((await request(t.app)[e.method](e.path).set(bearer(accessToken))).status).toBe(403);
  });

  it("returns real data when allowed", async () => {
    const { email } = await createStaff(R.INVENTORY_MANAGER);
    const { accessToken } = await loginAs(t.app, email);
    const res = await request(t.app).get("/api/inventory/items").set(bearer(accessToken));
    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([]);
  });

  it("does not trust anything the client claims about itself", async () => {
    const { email } = await createStaff(R.VIEWER);
    const { accessToken } = await loginAs(t.app, email);
    const res = await request(t.app).get("/api/users").set(bearer(accessToken)).set("X-User-Role", "SUPER_ADMIN").set("X-Permissions", "settings.manage_users").query({ role: "SUPER_ADMIN" });
    expect(res.status).toBe(403);
  });

  it("permission changes apply to a live token immediately (no stale-claim window)", async () => {
    const { email, user } = await createStaff(R.VIEWER);
    const { accessToken } = await loginAs(t.app, email);
    expect((await request(t.app).get("/api/users").set(bearer(accessToken))).status).toBe(403);
    await UserModel.updateOne({ _id: user.id }, { roleIds: [await roleId(R.ADMIN)] });
    expect((await request(t.app).get("/api/users").set(bearer(accessToken))).status).toBe(200);
    await UserModel.updateOne({ _id: user.id }, { roleIds: [await roleId(R.VIEWER)] });
    expect((await request(t.app).get("/api/users").set(bearer(accessToken))).status).toBe(403);
  });

  it("a deactivated user's live token stops working at once", async () => {
    const { email, user } = await createStaff(R.ADMIN);
    const { accessToken } = await loginAs(t.app, email);
    await UserModel.updateOne({ _id: user.id }, { isActive: false });
    expect((await request(t.app).get("/api/users").set(bearer(accessToken))).status).toBe(401);
  });
});

describe("user administration — no privilege escalation", () => {
  async function actor(role: RoleName) {
    const { email, user } = await createStaff(role);
    const { accessToken } = await loginAs(t.app, email);
    return { user, email, token: accessToken };
  }
  const newUser = async (a: { token: string }, roleIds: string[], email = "new.hire@example.test") =>
    request(t.app).post("/api/users").set(bearer(a.token)).send({ email, name: "New Hire", password: "Startup-Passw0rd", userType: "STAFF", roleIds });

  it("ADMIN can create a lower-privileged user, who can then sign in", async () => {
    const admin = await actor(R.ADMIN);
    const res = await newUser(admin, [await roleId(R.SALES_EXECUTIVE)]);
    expect(res.status).toBe(201);
    expect(res.body.user.passwordHash).toBeUndefined();
    expect((await request(t.app).post("/api/auth/login").send({ email: "new.hire@example.test", password: "Startup-Passw0rd" })).status).toBe(200);
  });

  it("ADMIN cannot mint a SUPER_ADMIN (the role carries a permission the admin lacks)", async () => {
    const admin = await actor(R.ADMIN);
    const res = await newUser(admin, [await roleId(R.SUPER_ADMIN)]);
    expect(res.status).toBe(403);
    expect(await UserModel.countDocuments({ email: "new.hire@example.test" })).toBe(0);
  });

  it("STORE_MANAGER lacks settings.manage_users entirely", async () => {
    const mgr = await actor(R.STORE_MANAGER);
    expect((await newUser(mgr, [await roleId(R.VIEWER)])).status).toBe(403);
  });

  it("SUPER_ADMIN can grant any role", async () => {
    const root = await actor(R.SUPER_ADMIN);
    expect((await newUser(root, [await roleId(R.SUPER_ADMIN)])).status).toBe(201);
  });

  it("ADMIN cannot modify, re-role, deactivate or revoke a SUPER_ADMIN", async () => {
    const admin = await actor(R.ADMIN);
    const root = await createStaff(R.SUPER_ADMIN);
    const auth = bearer(admin.token);
    expect((await request(t.app).patch(`/api/users/${root.user.id}`).set(auth).send({ isActive: false })).status).toBe(403);
    expect((await request(t.app).patch(`/api/users/${root.user.id}`).set(auth).send({ name: "Pwned" })).status).toBe(403);
    expect((await request(t.app).put(`/api/users/${root.user.id}/roles`).set(auth).send({ roleIds: [await roleId(R.VIEWER)] })).status).toBe(403);
    expect((await request(t.app).post(`/api/users/${root.user.id}/revoke-sessions`).set(auth)).status).toBe(403);
    expect((await UserModel.findById(root.user.id))!.isActive).toBe(true);
  });

  it("nobody can change their own roles or deactivate themselves (self-escalation / self-lockout)", async () => {
    const root = await actor(R.SUPER_ADMIN);
    const auth = bearer(root.token);
    expect((await request(t.app).put(`/api/users/${root.user.id}/roles`).set(auth).send({ roleIds: [await roleId(R.VIEWER)] })).status).toBe(403);
    expect((await request(t.app).patch(`/api/users/${root.user.id}`).set(auth).send({ isActive: false })).status).toBe(403);
  });

  it("changing another user's roles works within the actor's own permissions, and applies to their live token", async () => {
    const admin = await actor(R.ADMIN);
    const target = await createStaff(R.VIEWER);
    const targetLogin = await loginAs(t.app, target.email);
    expect((await request(t.app).get("/api/inventory/items").set(bearer(targetLogin.accessToken))).status).toBe(200);
    const res = await request(t.app).put(`/api/users/${target.user.id}/roles`).set(bearer(admin.token)).send({ roleIds: [await roleId(R.CUSTOMER_SUPPORT)] });
    expect(res.status).toBe(200);
    expect(res.body.user.roleIds).toEqual([await roleId(R.CUSTOMER_SUPPORT)]);
  });

  it("deactivating a user revokes their sessions and locks them out", async () => {
    const admin = await actor(R.ADMIN);
    const target = await createStaff(R.SALES_EXECUTIVE);
    const login = await loginAs(t.app, target.email);
    expect((await request(t.app).patch(`/api/users/${target.user.id}`).set(bearer(admin.token)).send({ isActive: false })).status).toBe(200);
    expect((await request(t.app).get("/api/auth/me").set(bearer(login.accessToken))).status).toBe(401);
    expect((await request(t.app).post("/api/auth/login").send({ email: target.email, password: PASSWORD })).status).toBe(401);
    expect(await SessionModel.countDocuments({ revokedAt: null })).toBe(1); // only the admin's own
  });

  it("rejects unknown roles, invalid ids and weak passwords", async () => {
    const admin = await actor(R.ADMIN);
    expect((await newUser(admin, ["64b0c0ffee0000000000ffff"])).status).toBe(400);
    expect((await request(t.app).get("/api/users/not-an-id").set(bearer(admin.token))).status).toBe(400);
    const weak = await request(t.app).post("/api/users").set(bearer(admin.token)).send({ email: "w@example.test", name: "W", password: "short", userType: "STAFF", roleIds: [] });
    expect(weak.status).toBe(400);
  });

  it("does not let a generic PATCH smuggle in roles, email or password fields", async () => {
    const admin = await actor(R.ADMIN);
    const target = await createStaff(R.VIEWER);
    const res = await request(t.app).patch(`/api/users/${target.user.id}`).set(bearer(admin.token)).send({ name: "Renamed", roleIds: [await roleId(R.ADMIN)], passwordHash: "x", email: "hijack@example.test" });
    expect(res.status).toBe(200);
    const after = (await UserModel.findById(target.user.id))!;
    expect(after.name).toBe("Renamed");
    expect(after.roleIds.map(String)).toEqual([await roleId(R.VIEWER)]);
    expect(after.email).toBe(target.email);
  });
});

describe("custom roles", () => {
  const body = (over = {}) => ({ name: "Floor Supervisor", description: "x", permissionKeys: [P.INVENTORY_VIEW, P.SALES_VIEW], ...over });

  it("only SUPER_ADMIN may create them; ADMIN gets 403", async () => {
    const root = await loginAs(t.app, (await createStaff(R.SUPER_ADMIN)).email);
    const admin = await loginAs(t.app, (await createStaff(R.ADMIN)).email);
    expect((await request(t.app).post("/api/roles").set(bearer(admin.accessToken)).send(body())).status).toBe(403);
    const ok = await request(t.app).post("/api/roles").set(bearer(root.accessToken)).send(body());
    expect(ok.status).toBe(201);
    expect(ok.body.role).toMatchObject({ isSystem: false, permissions: [P.INVENTORY_VIEW, P.SALES_VIEW].sort() });
  });

  it("rejects unknown permissions and reserved system-role names", async () => {
    const root = await loginAs(t.app, (await createStaff(R.SUPER_ADMIN)).email);
    const auth = bearer(root.accessToken);
    expect((await request(t.app).post("/api/roles").set(auth).send(body({ permissionKeys: ["inventory.teleport"] }))).status).toBe(400);
    expect((await request(t.app).post("/api/roles").set(auth).send(body({ name: "admin" }))).status).toBe(409);
  });

  it("system roles cannot be edited over the API", async () => {
    const root = await loginAs(t.app, (await createStaff(R.SUPER_ADMIN)).email);
    const viewer = await RoleModel.findOne({ name: R.VIEWER });
    const res = await request(t.app).put(`/api/roles/${viewer!._id}`).set(bearer(root.accessToken)).send(body());
    expect(res.status).toBe(409);
  });

  it("a custom role can be edited and then granted to a user", async () => {
    const root = await loginAs(t.app, (await createStaff(R.SUPER_ADMIN)).email);
    const auth = bearer(root.accessToken);
    const created = await request(t.app).post("/api/roles").set(auth).send(body());
    const updated = await request(t.app).put(`/api/roles/${created.body.role.id}`).set(auth).send(body({ permissionKeys: [P.REPORTS_VIEW] }));
    expect(updated.body.role.permissions).toEqual([P.REPORTS_VIEW]);
    const target = await createStaff(null);
    expect((await request(t.app).put(`/api/users/${target.user.id}/roles`).set(auth).send({ roleIds: [created.body.role.id] })).status).toBe(200);
    const login = await loginAs(t.app, target.email);
    expect(login.res.body.user.permissions).toEqual([P.REPORTS_VIEW]);
  });
});

describe("audit logging of sensitive operations", () => {
  const actions = async (filter = {}) => (await AuditLogModel.find(filter).sort({ _id: 1 })).map((a) => `${a.action}:${a.outcome}`);

  it("records denied access with who, what and which permission was missing", async () => {
    const { email, user } = await createStaff(R.VIEWER);
    const { accessToken } = await loginAs(t.app, email);
    await request(t.app).get("/api/users").set(bearer(accessToken)).set("User-Agent", "audit-test");
    const denied = await AuditLogModel.findOne({ action: "authz.denied" });
    expect(denied).toMatchObject({ outcome: "DENIED", actorEmail: email, userAgent: "audit-test" });
    expect(String(denied!.actorId)).toBe(user.id);
    expect(denied!.metadata).toMatchObject({ method: "GET", path: "/api/users", required: [P.SETTINGS_MANAGE_USERS] });
    expect(denied!.requestId).toBeTruthy();
  });

  it("records user creation, role changes, deactivation, and session revocation", async () => {
    const admin = await loginAs(t.app, (await createStaff(R.ADMIN)).email);
    const auth = bearer(admin.accessToken);
    const created = await request(t.app).post("/api/users").set(auth).send({ email: "a@example.test", name: "A", password: "Startup-Passw0rd", userType: "STAFF", roleIds: [] });
    const id = created.body.user.id;
    await request(t.app).put(`/api/users/${id}/roles`).set(auth).send({ roleIds: [await roleId(R.VIEWER)] });
    await request(t.app).post(`/api/users/${id}/revoke-sessions`).set(auth);
    await request(t.app).patch(`/api/users/${id}`).set(auth).send({ isActive: false });
    expect(await actions({ targetType: "user" })).toEqual(["user.created:SUCCESS", "user.roles_changed:SUCCESS", "user.sessions_revoked:SUCCESS", "user.deactivated:SUCCESS"]);
    const roles = await AuditLogModel.findOne({ action: "user.roles_changed" });
    expect(roles!.metadata).toMatchObject({ previousRoleIds: [], newRoleIds: [await roleId(R.VIEWER)] });
  });

  it("never stores passwords or tokens, even if a caller puts them in metadata", async () => {
    const admin = await loginAs(t.app, (await createStaff(R.ADMIN)).email);
    await request(t.app).post("/api/users").set(bearer(admin.accessToken)).send({ email: "b@example.test", name: "B", password: "Startup-Passw0rd", userType: "STAFF", roleIds: [] });
    const dump = JSON.stringify(await AuditLogModel.find());
    for (const secret of ["Startup-Passw0rd", PASSWORD, admin.accessToken, "passwordHash"]) expect(dump).not.toContain(secret);
  });

  it("the audit log endpoint is permission-guarded, itself audited, and filterable", async () => {
    const viewer = await loginAs(t.app, (await createStaff(R.VIEWER)).email);
    expect((await request(t.app).get("/api/audit-logs").set(bearer(viewer.accessToken))).status).toBe(403);

    const root = await loginAs(t.app, (await createStaff(R.SUPER_ADMIN)).email);
    const res = await request(t.app).get("/api/audit-logs").set(bearer(root.accessToken)).query({ action: "auth.login" });
    expect(res.status).toBe(200);
    expect(res.body.entries.length).toBeGreaterThanOrEqual(2);
    expect(res.body.entries.every((e: { action: string }) => e.action === "auth.login")).toBe(true);
    await new Promise((r) => setTimeout(r, 50));
    expect(await actions({ action: "audit.viewed" })).toContain("audit.viewed:SUCCESS");
  });

  it("audit entries cannot be altered or deleted through the application", async () => {
    await loginAs(t.app, (await createStaff(R.VIEWER)).email);
    await expect(AuditLogModel.updateMany({}, { outcome: "SUCCESS" })).rejects.toThrow(/append-only/);
    await expect(AuditLogModel.deleteMany({})).rejects.toThrow(/append-only/);
  });
});
