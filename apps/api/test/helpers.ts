import request from "supertest";
import type { Express } from "express";
import { ROLE_NAMES, type RoleName } from "@jewellery/types";
import type { AppConfig } from "../src/config/app-config";
import { createApp } from "../src/http/app";
import { createMemoryStorage } from "../src/modules/media/storage";
import { InMemoryEmailSender } from "../src/modules/auth/email";
import { syncRbac } from "../src/modules/auth/rbac/rbac-sync";
import { RoleModel } from "../src/modules/auth/role.model";
import { createUser } from "../src/modules/auth/user.service";
import { createAuthService } from "../src/modules/auth/auth.service";

export const PASSWORD = "Correct-Horse-9";

export function testConfig(overrides: { auth?: Partial<AppConfig["auth"]>; rateLimit?: Partial<AppConfig["rateLimit"]> } = {}): AppConfig {
  return {
    env: "test",
    port: 0,
    allowedOrigins: ["http://localhost:3000"],
    trustProxy: false,
    auth: {
      accessSecret: "test-secret-test-secret-test-secret-1234",
      accessTtlSeconds: 900,
      issuer: "jewellery-erp",
      audience: "jewellery-erp-api",
      refreshIdleTtlDays: 7,
      sessionAbsoluteTtlDays: 30,
      bcryptRounds: 4,
      maxFailedLogins: 3,
      lockoutMinutes: 15,
      passwordResetTtlMinutes: 30,
      appBaseUrl: "http://localhost:3000",
      cookie: { name: "jerp_rt", secure: false },
      ...overrides.auth,
    },
    media: { dir: "./.data/test-media", publicBaseUrl: "http://api.test" },
    rateLimit: {
      enabled: false,
      login: { windowMs: 60_000, max: 1000 },
      forgotPassword: { windowMs: 60_000, max: 1000 },
      ...overrides.rateLimit,
    },
  };
}

export function buildTestApp(overrides?: Parameters<typeof testConfig>[0]) {
  const config = testConfig(overrides);
  const emailSender = new InMemoryEmailSender();
  const mediaStorage = createMemoryStorage();
  const app: Express = createApp({ config, emailSender, mediaStorage });
  const authService = createAuthService({ config, emailSender });
  return { app, config, emailSender, authService, mediaStorage };
}

/** The suite wipes every collection after each test, so RBAC must be re-seeded per test. */
export const seedRbac = () => syncRbac();

let counter = 0;
export async function createStaff(roleName: RoleName | null, opts: { email?: string; password?: string; isActive?: boolean } = {}) {
  const role = roleName ? await RoleModel.findOne({ name: roleName }) : null;
  const email = opts.email ?? `user${++counter}.${(roleName ?? "norole").toLowerCase()}@example.test`;
  const user = await createUser(
    { email, name: `Test ${roleName ?? "NoRole"}`, password: opts.password ?? PASSWORD, userType: "STAFF", roleIds: role ? [String(role._id)] : [], isActive: opts.isActive ?? true },
    4
  );
  return { user, email, password: opts.password ?? PASSWORD };
}

export async function roleId(name: RoleName): Promise<string> {
  return String((await RoleModel.findOne({ name }))!._id);
}

/** Signs in over HTTP and returns an agent that carries the refresh cookie plus the access token. */
export async function loginAs(app: Express, email: string, password = PASSWORD) {
  const agent = request.agent(app);
  const res = await agent.post("/api/auth/login").send({ email, password });
  return { agent, res, accessToken: res.body.accessToken as string, cookies: res.headers["set-cookie"] as unknown as string[] | undefined };
}

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
export { ROLE_NAMES };
