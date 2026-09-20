import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { ROLE_NAMES as R } from "@jewellery/types";
import { PASSWORD, bearer, buildTestApp, createStaff, loginAs, seedRbac } from "../../test/helpers";
import { SessionModel } from "../modules/auth/session.model";

let t: ReturnType<typeof buildTestApp>;
beforeEach(async () => {
  await seedRbac();
  t = buildTestApp();
});

const refreshCookie = (res: request.Response) => (res.headers["set-cookie"] as unknown as string[] | undefined)?.find((c) => c.startsWith("jerp_rt="));

describe("POST /api/auth/login", () => {
  it("returns an access token + user, and sets the refresh token ONLY as a hardened cookie", async () => {
    const { email } = await createStaff(R.STORE_MANAGER);
    const res = await request(t.app).post("/api/auth/login").send({ email, password: PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTypeOf("string");
    expect(res.body.user.roles).toEqual([R.STORE_MANAGER]);
    expect(res.body.user.permissions).toContain("inventory.adjust");
    expect(res.body.refreshToken).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash/i);

    const cookie = refreshCookie(res)!;
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Strict/i);
    expect(cookie).toMatch(/Path=\/api\/auth/);
    expect(res.headers["cache-control"]).toBe("no-store");
  });

  it("marks the cookie Secure when configured (production default)", async () => {
    const secure = buildTestApp({ auth: { cookie: { name: "jerp_rt", secure: true } } });
    const { email } = await createStaff(R.VIEWER);
    const res = await request(secure.app).post("/api/auth/login").send({ email, password: PASSWORD });
    expect(refreshCookie(res)).toMatch(/Secure/i);
  });

  it("401 with a generic body for wrong password and unknown email alike", async () => {
    const { email } = await createStaff(R.VIEWER);
    const wrong = await request(t.app).post("/api/auth/login").send({ email, password: "Wrong-Password-1" });
    const unknown = await request(t.app).post("/api/auth/login").send({ email: "ghost@example.test", password: PASSWORD });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body).toEqual(unknown.body);
    expect(refreshCookie(wrong)).toBeUndefined();
  });

  it("400 on a malformed body and never a 500", async () => {
    expect((await request(t.app).post("/api/auth/login").send({})).status).toBe(400);
    expect((await request(t.app).post("/api/auth/login").send({ email: "nope", password: "x" })).status).toBe(400);
    expect((await request(t.app).post("/api/auth/login").set("content-type", "application/json").send("{bad json")).status).toBe(400);
    expect((await request(t.app).post("/api/auth/login").send({ email: { $ne: null }, password: { $ne: null } })).status).toBe(400); // NoSQL-injection shape
  });

  it("rate-limits repeated login attempts per IP", async () => {
    const limited = buildTestApp({ rateLimit: { enabled: true, login: { windowMs: 60_000, max: 3 } } });
    const attempt = () => request(limited.app).post("/api/auth/login").send({ email: "a@example.test", password: "x" });
    const statuses = [] as number[];
    for (let i = 0; i < 5; i++) statuses.push((await attempt()).status);
    expect(statuses).toEqual([401, 401, 401, 429, 429]);
  });
});

describe("GET /api/auth/me", () => {
  it("returns the caller, and rejects missing / malformed credentials", async () => {
    const { email } = await createStaff(R.ACCOUNTANT);
    const { accessToken } = await loginAs(t.app, email);
    const ok = await request(t.app).get("/api/auth/me").set(bearer(accessToken));
    expect(ok.status).toBe(200);
    expect(ok.body.user.email).toBe(email);

    expect((await request(t.app).get("/api/auth/me")).status).toBe(401);
    expect((await request(t.app).get("/api/auth/me").set("Authorization", "Basic abc")).status).toBe(401);
    expect((await request(t.app).get("/api/auth/me").set("Authorization", "Bearer")).status).toBe(401);
    expect((await request(t.app).get("/api/auth/me").set("Authorization", `Bearer ${accessToken}x`)).status).toBe(401);
  });
});

describe("POST /api/auth/refresh", () => {
  it("rotates the cookie and returns a new session; the old cookie is then dead", async () => {
    const { email } = await createStaff(R.VIEWER);
    const { res: login } = await loginAs(t.app, email);
    const oldCookie = refreshCookie(login)!;

    const refreshed = await request(t.app).post("/api/auth/refresh").set("Cookie", oldCookie);
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.accessToken).toBeTypeOf("string");
    expect(refreshCookie(refreshed)).toBeDefined();
    expect(refreshCookie(refreshed)).not.toBe(oldCookie);

    const replay = await request(t.app).post("/api/auth/refresh").set("Cookie", oldCookie);
    expect(replay.status).toBe(401);
    expect(refreshCookie(replay)).toMatch(/Expires=Thu, 01 Jan 1970/); // cookie cleared
  });

  it("401 without a cookie; does not accept the token from the body or a header", async () => {
    const { email } = await createStaff(R.VIEWER);
    const { res } = await loginAs(t.app, email);
    const token = refreshCookie(res)!.split(";")[0].split("=")[1];
    expect((await request(t.app).post("/api/auth/refresh")).status).toBe(401);
    expect((await request(t.app).post("/api/auth/refresh").send({ refreshToken: token })).status).toBe(401);
    expect((await request(t.app).post("/api/auth/refresh").set("Authorization", `Bearer ${token}`)).status).toBe(401);
  });

  it("refuses a cross-origin request (CSRF) even with a valid cookie, but allows the trusted origin", async () => {
    const { email } = await createStaff(R.VIEWER);
    const { res } = await loginAs(t.app, email);
    const cookie = refreshCookie(res)!;
    expect((await request(t.app).post("/api/auth/refresh").set("Cookie", cookie).set("Origin", "https://evil.example")).status).toBe(403);
    expect((await request(t.app).post("/api/auth/refresh").set("Cookie", cookie).set("Origin", "http://localhost:3000")).status).toBe(200);
  });

  it("reuse of a rotated cookie kills the session, so the newest cookie fails too", async () => {
    const { email } = await createStaff(R.VIEWER);
    const { res } = await loginAs(t.app, email);
    const first = refreshCookie(res)!;
    const second = refreshCookie(await request(t.app).post("/api/auth/refresh").set("Cookie", first))!;
    await request(t.app).post("/api/auth/refresh").set("Cookie", first);
    expect((await request(t.app).post("/api/auth/refresh").set("Cookie", second)).status).toBe(401);
  });
});

describe("POST /api/auth/logout", () => {
  it("revokes the session at once: the access token dies immediately and the cookie is cleared", async () => {
    const { email } = await createStaff(R.VIEWER);
    const { res, accessToken } = await loginAs(t.app, email);
    const cookie = refreshCookie(res)!;

    const out = await request(t.app).post("/api/auth/logout").set("Cookie", cookie);
    expect(out.status).toBe(204);
    expect(refreshCookie(out)).toMatch(/Expires=Thu, 01 Jan 1970/);

    expect((await request(t.app).get("/api/auth/me").set(bearer(accessToken))).status).toBe(401);
    expect((await request(t.app).post("/api/auth/refresh").set("Cookie", cookie)).status).toBe(401);
  });

  it("works with only a bearer token (no cookie), works when already logged out, and is idempotent", async () => {
    const { email } = await createStaff(R.VIEWER);
    const { accessToken } = await loginAs(t.app, email);
    expect((await request(t.app).post("/api/auth/logout").set(bearer(accessToken))).status).toBe(204);
    expect((await request(t.app).post("/api/auth/logout").set(bearer(accessToken))).status).toBe(204);
    expect((await request(t.app).post("/api/auth/logout")).status).toBe(204);
  });

  it("logout-all requires auth and signs out every device", async () => {
    const { email } = await createStaff(R.VIEWER);
    const a = await loginAs(t.app, email);
    const b = await loginAs(t.app, email);
    expect((await request(t.app).post("/api/auth/logout-all")).status).toBe(401);
    expect((await request(t.app).post("/api/auth/logout-all").set(bearer(a.accessToken))).status).toBe(204);
    expect((await request(t.app).get("/api/auth/me").set(bearer(b.accessToken))).status).toBe(401);
    expect(await SessionModel.countDocuments({ revokedAt: null })).toBe(0);
  });
});

describe("password reset over HTTP", () => {
  it("forgot-password answers 202 identically for known and unknown emails", async () => {
    const { email } = await createStaff(R.VIEWER);
    const known = await request(t.app).post("/api/auth/forgot-password").send({ email });
    const unknown = await request(t.app).post("/api/auth/forgot-password").send({ email: "ghost@example.test" });
    expect(known.status).toBe(202);
    expect(unknown.status).toBe(202);
    expect(known.body).toEqual(unknown.body);
    expect(t.emailSender.sent).toHaveLength(1);
  });

  it("completes the reset end to end and invalidates the old password and sessions", async () => {
    const { email } = await createStaff(R.VIEWER);
    const { accessToken } = await loginAs(t.app, email);
    await request(t.app).post("/api/auth/forgot-password").send({ email });
    const mail = t.emailSender.sent[0] as { resetUrl: string };
    const token = new URL(mail.resetUrl).searchParams.get("token")!;

    expect((await request(t.app).post("/api/auth/reset-password").send({ token, newPassword: "Reset-Passw0rd-42" })).status).toBe(204);
    expect((await request(t.app).get("/api/auth/me").set(bearer(accessToken))).status).toBe(401);
    expect((await request(t.app).post("/api/auth/login").send({ email, password: PASSWORD })).status).toBe(401);
    expect((await request(t.app).post("/api/auth/login").send({ email, password: "Reset-Passw0rd-42" })).status).toBe(200);
    expect((await request(t.app).post("/api/auth/reset-password").send({ token, newPassword: "Reset-Passw0rd-43" })).status).toBe(400);
  });

  it("rate-limits forgot-password", async () => {
    const limited = buildTestApp({ rateLimit: { enabled: true, forgotPassword: { windowMs: 60_000, max: 2 } } });
    const send = () => request(limited.app).post("/api/auth/forgot-password").send({ email: "a@example.test" });
    expect([(await send()).status, (await send()).status, (await send()).status]).toEqual([202, 202, 429]);
  });

  it("change-password requires auth and the correct current password", async () => {
    const { email } = await createStaff(R.VIEWER);
    const { accessToken } = await loginAs(t.app, email);
    const body = { currentPassword: PASSWORD, newPassword: "Brand-New-Passw0rd" };
    expect((await request(t.app).post("/api/auth/change-password").send(body)).status).toBe(401);
    expect((await request(t.app).post("/api/auth/change-password").set(bearer(accessToken)).send({ ...body, currentPassword: "Wrong-Password-1" })).status).toBe(400);
    expect((await request(t.app).post("/api/auth/change-password").set(bearer(accessToken)).send(body)).status).toBe(204);
  });
});

describe("platform hardening", () => {
  it("sets security headers, hides the framework, and never leaks internals on errors", async () => {
    const res = await request(t.app).get("/api/auth/me");
    expect(res.headers["x-powered-by"]).toBeUndefined();
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-request-id"]).toBeDefined();
    expect(JSON.stringify(res.body)).not.toMatch(/stack|mongoose|at \w+/i);
  });

  it("CORS allows only configured origins and supports credentials", async () => {
    const ok = await request(t.app).get("/health").set("Origin", "http://localhost:3000");
    expect(ok.headers["access-control-allow-origin"]).toBe("http://localhost:3000");
    expect(ok.headers["access-control-allow-credentials"]).toBe("true");
    const bad = await request(t.app).get("/health").set("Origin", "https://evil.example");
    expect(bad.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("unknown routes are a JSON 404, not a stack trace", async () => {
    const res = await request(t.app).get("/api/does-not-exist");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { code: "NOT_FOUND", message: "Route not found" } });
  });
});
