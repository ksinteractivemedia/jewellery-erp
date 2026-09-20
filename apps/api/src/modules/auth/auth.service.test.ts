import { beforeEach, describe, expect, it } from "vitest";
import { PERMISSIONS as P, ROLE_NAMES as R } from "@jewellery/types";
import { PASSWORD, buildTestApp, createStaff, roleId, seedRbac } from "../../../test/helpers";
import { AuditLogModel } from "../audit/audit-log.model";
import { PasswordResetTokenModel } from "./password-reset-token.model";
import { SessionModel } from "./session.model";
import { UserModel } from "./user.model";
import { setUserRoleIds } from "./user.repository";

const meta = { ip: "203.0.113.7", userAgent: "vitest", requestId: "req-test-0001" };

let ctx: ReturnType<typeof buildTestApp>;
beforeEach(async () => {
  await seedRbac();
  ctx = buildTestApp();
});

const auditActions = async () => (await AuditLogModel.find().sort({ _id: 1 })).map((a) => `${a.action}:${a.outcome}`);

describe("login", () => {
  it("signs in with email + password and returns the caller's permissions", async () => {
    const { email } = await createStaff(R.SALES_EXECUTIVE);
    const { session, refreshToken } = await ctx.authService.login({ email, password: PASSWORD }, meta);

    expect(session.user.roles).toEqual([R.SALES_EXECUTIVE]);
    expect(session.user.permissions).toContain(P.SALES_CREATE);
    expect(session.user.permissions).not.toContain(P.SALES_OVERRIDE_PRICE);
    expect(session.expiresIn).toBe(900);
    expect(refreshToken.split(".")).toHaveLength(2);
    expect(JSON.stringify(session)).not.toContain(refreshToken);
    expect(await auditActions()).toEqual(["auth.login:SUCCESS"]);
  });

  it("is case/whitespace-insensitive on email", async () => {
    const { email } = await createStaff(R.VIEWER);
    await expect(ctx.authService.login({ email: `  ${email.toUpperCase()} `, password: PASSWORD }, meta)).resolves.toBeDefined();
  });

  it("gives the SAME error for an unknown email and a wrong password (no account enumeration)", async () => {
    const { email } = await createStaff(R.VIEWER);
    const unknown = await ctx.authService.login({ email: "nobody@example.test", password: PASSWORD }, meta).catch((e) => e);
    const wrong = await ctx.authService.login({ email, password: "Wrong-Password-1" }, meta).catch((e) => e);
    expect(unknown.code).toBe("INVALID_CREDENTIALS");
    expect(wrong.code).toBe("INVALID_CREDENTIALS");
    expect(unknown.message).toBe(wrong.message);
  });

  it("records the real reason in the audit log, never the password", async () => {
    const { email } = await createStaff(R.VIEWER);
    await ctx.authService.login({ email: "nobody@example.test", password: "Secret-Guess-1" }, meta).catch(() => {});
    await ctx.authService.login({ email, password: "Secret-Guess-2" }, meta).catch(() => {});
    const entries = await AuditLogModel.find({ action: "auth.login" }).sort({ _id: 1 });
    expect(entries.map((e) => (e.metadata as { reason: string }).reason)).toEqual(["unknown_user", "bad_password"]);
    expect(JSON.stringify(entries)).not.toContain("Secret-Guess");
    expect(entries[0].ip).toBe(meta.ip);
  });

  it("rejects an inactive user even with the right password", async () => {
    const { email } = await createStaff(R.VIEWER, { isActive: false });
    await expect(ctx.authService.login({ email, password: PASSWORD }, meta)).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
  });

  it("locks the account after repeated failures — even the correct password is refused while locked", async () => {
    const { email } = await createStaff(R.VIEWER);
    for (let i = 0; i < 3; i++) await ctx.authService.login({ email, password: "Wrong-Password-1" }, meta).catch(() => {});
    await expect(ctx.authService.login({ email, password: PASSWORD }, meta)).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
    const user = await UserModel.findOne({ email });
    expect(user!.lockedUntil!.getTime()).toBeGreaterThan(Date.now());
    const reasons = (await AuditLogModel.find({ action: "auth.login" }).sort({ _id: 1 })).map((e) => (e.metadata as { reason: string }).reason);
    expect(reasons).toEqual(["bad_password", "bad_password", "bad_password_account_now_locked", "account_locked"]);
  });

  it("lets the user back in once the lockout lapses, and resets the counters", async () => {
    const { email } = await createStaff(R.VIEWER);
    for (let i = 0; i < 3; i++) await ctx.authService.login({ email, password: "Wrong-Password-1" }, meta).catch(() => {});
    await UserModel.updateOne({ email }, { lockedUntil: new Date(Date.now() - 1000) });
    await expect(ctx.authService.login({ email, password: PASSWORD }, meta)).resolves.toBeDefined();
    const user = await UserModel.findOne({ email });
    expect(user!.failedLoginAttempts).toBe(0);
    expect(user!.lockedUntil).toBeUndefined();
  });

  it("a successful login clears earlier failures", async () => {
    const { email } = await createStaff(R.VIEWER);
    await ctx.authService.login({ email, password: "Wrong-Password-1" }, meta).catch(() => {});
    await ctx.authService.login({ email, password: PASSWORD }, meta);
    expect((await UserModel.findOne({ email }))!.failedLoginAttempts).toBe(0);
  });

  it("stores refresh tokens only as hashes", async () => {
    const { email } = await createStaff(R.VIEWER);
    const { refreshToken } = await ctx.authService.login({ email, password: PASSWORD }, meta);
    const secret = refreshToken.split(".")[1];
    const session = await SessionModel.findOne();
    expect(JSON.stringify(session)).not.toContain(secret);
    expect(session!.refreshTokenHash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("refresh-token rotation", () => {
  async function signedIn(role = R.VIEWER) {
    const { email, user } = await createStaff(role);
    const issued = await ctx.authService.login({ email, password: PASSWORD }, meta);
    return { email, user, ...issued };
  }

  it("issues a new refresh token and a fresh access token each time", async () => {
    const first = await signedIn();
    const second = await ctx.authService.refresh(first.refreshToken, meta);
    expect(second.refreshToken).not.toBe(first.refreshToken);
    expect(second.session.accessToken).not.toBe(first.session.accessToken);
    expect(second.session.user.id).toBe(first.session.user.id);
    await expect(ctx.authService.refresh(second.refreshToken, meta)).resolves.toBeDefined();
  });

  it("detects reuse of a rotated token, revokes the whole session, and audits it", async () => {
    const first = await signedIn();
    const second = await ctx.authService.refresh(first.refreshToken, meta);

    await expect(ctx.authService.refresh(first.refreshToken, meta)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    // The legitimate holder of the newer token is signed out too — a stolen token can't be told apart.
    await expect(ctx.authService.refresh(second.refreshToken, meta)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    await expect(ctx.authService.authenticate(second.session.accessToken)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });

    expect((await SessionModel.findOne())!.revokedReason).toBe("REUSE_DETECTED");
    expect(await auditActions()).toContain("auth.session_reuse_detected:DENIED");
  });

  it("lets exactly one of two concurrent refreshes with the same token win", async () => {
    const first = await signedIn();
    const results = await Promise.allSettled([ctx.authService.refresh(first.refreshToken, meta), ctx.authService.refresh(first.refreshToken, meta)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  });

  it("rejects an idle-expired session and revokes it", async () => {
    const first = await signedIn();
    await SessionModel.updateOne({}, { idleExpiresAt: new Date(Date.now() - 1000) });
    await expect(ctx.authService.refresh(first.refreshToken, meta)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    expect((await SessionModel.findOne())!.revokedReason).toBe("EXPIRED");
  });

  it("enforces the absolute session lifetime regardless of activity", async () => {
    const first = await signedIn();
    await SessionModel.updateOne({}, { absoluteExpiresAt: new Date(Date.now() - 1000) });
    await expect(ctx.authService.refresh(first.refreshToken, meta)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    await expect(ctx.authService.authenticate(first.session.accessToken)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });

  it("never extends a session past its absolute expiry", async () => {
    const first = await signedIn();
    await SessionModel.updateOne({}, { absoluteExpiresAt: new Date(Date.now() + 60_000) });
    await ctx.authService.refresh(first.refreshToken, meta);
    const s = await SessionModel.findOne();
    expect(s!.idleExpiresAt.getTime()).toBeLessThanOrEqual(s!.absoluteExpiresAt.getTime());
  });

  it("refuses to refresh for a deactivated user", async () => {
    const first = await signedIn();
    await UserModel.updateOne({ _id: first.user.id }, { isActive: false });
    await expect(ctx.authService.refresh(first.refreshToken, meta)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });

  it("rejects malformed and forged refresh tokens", async () => {
    const first = await signedIn();
    for (const bad of [undefined, "", "garbage", `${first.refreshToken}tampered`, `${first.refreshToken.split(".")[0]}.${"A".repeat(43)}`]) {
      await expect(ctx.authService.refresh(bad, meta)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    }
    // A forged secret must not revoke the real session.
    expect((await SessionModel.findOne())!.revokedAt).toBeUndefined();
  });
});

describe("authenticate (per-request)", () => {
  it("resolves identity, roles and permissions", async () => {
    const { email } = await createStaff(R.ACCOUNTANT);
    const { session } = await ctx.authService.login({ email, password: PASSWORD }, meta);
    const auth = await ctx.authService.authenticate(session.accessToken);
    expect(auth.roles.map((r) => r.name)).toEqual([R.ACCOUNTANT]);
    expect(auth.permissions.has(P.ACCOUNTING_CREATE_PAYMENT)).toBe(true);
    expect(auth.permissions.has(P.SETTINGS_MANAGE_USERS)).toBe(false);
  });

  it("logout takes effect immediately — the still-unexpired access token stops working", async () => {
    const { email } = await createStaff(R.VIEWER);
    const { session, refreshToken } = await ctx.authService.login({ email, password: PASSWORD }, meta);
    await ctx.authService.logout({ refreshToken }, meta);
    await expect(ctx.authService.authenticate(session.accessToken)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    await expect(ctx.authService.refresh(refreshToken, meta)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });

  it("deactivating a user takes effect immediately", async () => {
    const { email, user } = await createStaff(R.VIEWER);
    const { session } = await ctx.authService.login({ email, password: PASSWORD }, meta);
    await UserModel.updateOne({ _id: user.id }, { isActive: false });
    await expect(ctx.authService.authenticate(session.accessToken)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });

  it("a role change takes effect on the next request, not at token expiry", async () => {
    const { email, user } = await createStaff(R.VIEWER);
    const { session } = await ctx.authService.login({ email, password: PASSWORD }, meta);
    expect((await ctx.authService.authenticate(session.accessToken)).permissions.has(P.SALES_CREATE)).toBe(false);
    await setUserRoleIds(user.id, [await roleId(R.SALES_EXECUTIVE)]);
    expect((await ctx.authService.authenticate(session.accessToken)).permissions.has(P.SALES_CREATE)).toBe(true);
  });

  it("an inactive role grants nothing", async () => {
    const { email } = await createStaff(R.SALES_MANAGER);
    const { session } = await ctx.authService.login({ email, password: PASSWORD }, meta);
    await (await import("./role.model")).RoleModel.updateOne({ name: R.SALES_MANAGER }, { isActive: false });
    expect((await ctx.authService.authenticate(session.accessToken)).permissions.size).toBe(0);
  });

  it("a user with no roles authenticates but holds no permissions", async () => {
    const { email } = await createStaff(null);
    const { session } = await ctx.authService.login({ email, password: PASSWORD }, meta);
    expect((await ctx.authService.authenticate(session.accessToken)).permissions.size).toBe(0);
  });
});

describe("logout", () => {
  it("is idempotent and only kills its own session", async () => {
    const { email } = await createStaff(R.VIEWER);
    const a = await ctx.authService.login({ email, password: PASSWORD }, meta);
    const b = await ctx.authService.login({ email, password: PASSWORD }, meta);
    await ctx.authService.logout({ refreshToken: a.refreshToken }, meta);
    await ctx.authService.logout({ refreshToken: a.refreshToken }, meta);
    await ctx.authService.logout({}, meta);
    await expect(ctx.authService.authenticate(b.session.accessToken)).resolves.toBeDefined();
    expect((await auditActions()).filter((a) => a === "auth.logout:SUCCESS")).toHaveLength(1);
  });

  it("logout-all kills every session of the user and nobody else's", async () => {
    const one = await createStaff(R.VIEWER);
    const two = await createStaff(R.VIEWER);
    const a1 = await ctx.authService.login({ email: one.email, password: PASSWORD }, meta);
    const a2 = await ctx.authService.login({ email: one.email, password: PASSWORD }, meta);
    const other = await ctx.authService.login({ email: two.email, password: PASSWORD }, meta);
    await ctx.authService.logoutAll(await ctx.authService.authenticate(a1.session.accessToken), meta);
    await expect(ctx.authService.authenticate(a1.session.accessToken)).rejects.toBeDefined();
    await expect(ctx.authService.authenticate(a2.session.accessToken)).rejects.toBeDefined();
    await expect(ctx.authService.authenticate(other.session.accessToken)).resolves.toBeDefined();
  });
});

describe("change password", () => {
  it("requires the current password, revokes OTHER sessions, keeps the current one, and notifies by email", async () => {
    const { email } = await createStaff(R.VIEWER);
    const here = await ctx.authService.login({ email, password: PASSWORD }, meta);
    const elsewhere = await ctx.authService.login({ email, password: PASSWORD }, meta);
    const actor = await ctx.authService.authenticate(here.session.accessToken);

    await ctx.authService.changePassword(actor, { currentPassword: PASSWORD, newPassword: "Brand-New-Passw0rd" }, meta);

    await expect(ctx.authService.authenticate(here.session.accessToken)).resolves.toBeDefined();
    await expect(ctx.authService.authenticate(elsewhere.session.accessToken)).rejects.toBeDefined();
    await expect(ctx.authService.login({ email, password: PASSWORD }, meta)).rejects.toBeDefined();
    await expect(ctx.authService.login({ email, password: "Brand-New-Passw0rd" }, meta)).resolves.toBeDefined();
    expect(ctx.emailSender.sent.map((m) => m.kind)).toEqual(["password_changed"]);
  });

  it("rejects a wrong current password and counts it toward lockout", async () => {
    const { email } = await createStaff(R.VIEWER);
    const actor = await ctx.authService.authenticate((await ctx.authService.login({ email, password: PASSWORD }, meta)).session.accessToken);
    await expect(ctx.authService.changePassword(actor, { currentPassword: "Wrong-Password-1", newPassword: "Brand-New-Passw0rd" }, meta)).rejects.toMatchObject({ code: "INVALID_CURRENT_PASSWORD" });
    expect((await UserModel.findOne({ email }))!.failedLoginAttempts).toBe(1);
  });

  it("enforces the password policy and rejects reusing the current password", async () => {
    const { email } = await createStaff(R.VIEWER);
    const actor = await ctx.authService.authenticate((await ctx.authService.login({ email, password: PASSWORD }, meta)).session.accessToken);
    await expect(ctx.authService.changePassword(actor, { currentPassword: PASSWORD, newPassword: "short1" }, meta)).rejects.toThrow();
    await expect(ctx.authService.changePassword(actor, { currentPassword: PASSWORD, newPassword: "onlyletterslong" }, meta)).rejects.toThrow();
    await expect(ctx.authService.changePassword(actor, { currentPassword: PASSWORD, newPassword: PASSWORD }, meta)).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });
});

describe("password reset", () => {
  const tokenFromEmail = (c: typeof ctx) => {
    const mail = c.emailSender.sent.find((m) => m.kind === "password_reset");
    return mail && "resetUrl" in mail ? new URL(mail.resetUrl).searchParams.get("token")! : undefined;
  };

  it("emails a single-use link to a known account and NOTHING to an unknown one — with the same outward result", async () => {
    const { email } = await createStaff(R.VIEWER);
    await expect(ctx.authService.requestPasswordReset({ email: "ghost@example.test" }, meta)).resolves.toBeUndefined();
    expect(ctx.emailSender.sent).toHaveLength(0);
    await expect(ctx.authService.requestPasswordReset({ email }, meta)).resolves.toBeUndefined();
    expect(ctx.emailSender.sent).toHaveLength(1);
    const mail = ctx.emailSender.sent[0] as { resetUrl: string; to: string };
    expect(mail.to).toBe(email);
    expect(mail.resetUrl).toMatch(/^http:\/\/localhost:3000\/reset-password\?token=/);
  });

  it("stores only a hash of the reset token", async () => {
    const { email } = await createStaff(R.VIEWER);
    await ctx.authService.requestPasswordReset({ email }, meta);
    const secret = tokenFromEmail(ctx)!.split(".")[1];
    expect(JSON.stringify(await PasswordResetTokenModel.find())).not.toContain(secret);
  });

  it("resets the password, signs out every session, and the link cannot be reused", async () => {
    const { email } = await createStaff(R.VIEWER);
    const live = await ctx.authService.login({ email, password: PASSWORD }, meta);
    await ctx.authService.requestPasswordReset({ email }, meta);
    const token = tokenFromEmail(ctx)!;

    await ctx.authService.resetPassword({ token, newPassword: "Reset-Passw0rd-42" }, meta);

    await expect(ctx.authService.authenticate(live.session.accessToken)).rejects.toBeDefined();
    await expect(ctx.authService.refresh(live.refreshToken, meta)).rejects.toBeDefined();
    await expect(ctx.authService.login({ email, password: PASSWORD }, meta)).rejects.toBeDefined();
    await expect(ctx.authService.login({ email, password: "Reset-Passw0rd-42" }, meta)).resolves.toBeDefined();
    await expect(ctx.authService.resetPassword({ token, newPassword: "Another-Passw0rd-1" }, meta)).rejects.toMatchObject({ code: "INVALID_RESET_TOKEN" });
    expect(ctx.emailSender.sent.map((m) => m.kind)).toEqual(["password_reset", "password_changed"]);
  });

  it("clears a lockout", async () => {
    const { email } = await createStaff(R.VIEWER);
    for (let i = 0; i < 3; i++) await ctx.authService.login({ email, password: "Wrong-Password-1" }, meta).catch(() => {});
    await ctx.authService.requestPasswordReset({ email }, meta);
    await ctx.authService.resetPassword({ token: tokenFromEmail(ctx)!, newPassword: "Reset-Passw0rd-42" }, meta);
    await expect(ctx.authService.login({ email, password: "Reset-Passw0rd-42" }, meta)).resolves.toBeDefined();
  });

  it("rejects an expired token", async () => {
    const { email } = await createStaff(R.VIEWER);
    await ctx.authService.requestPasswordReset({ email }, meta);
    await PasswordResetTokenModel.updateOne({}, { expiresAt: new Date(Date.now() - 1000) });
    await expect(ctx.authService.resetPassword({ token: tokenFromEmail(ctx)!, newPassword: "Reset-Passw0rd-42" }, meta)).rejects.toMatchObject({ code: "INVALID_RESET_TOKEN" });
  });

  it("only the newest emailed link works", async () => {
    const { email } = await createStaff(R.VIEWER);
    await ctx.authService.requestPasswordReset({ email }, meta);
    const older = tokenFromEmail(ctx)!;
    ctx.emailSender.sent.length = 0;
    await ctx.authService.requestPasswordReset({ email }, meta);
    const newer = tokenFromEmail(ctx)!;
    await expect(ctx.authService.resetPassword({ token: older, newPassword: "Reset-Passw0rd-42" }, meta)).rejects.toMatchObject({ code: "INVALID_RESET_TOKEN" });
    await expect(ctx.authService.resetPassword({ token: newer, newPassword: "Reset-Passw0rd-42" }, meta)).resolves.toBeUndefined();
  });

  it("a wrong secret is rejected WITHOUT consuming the real token", async () => {
    const { email } = await createStaff(R.VIEWER);
    await ctx.authService.requestPasswordReset({ email }, meta);
    const token = tokenFromEmail(ctx)!;
    const forged = `${token.split(".")[0]}.${"A".repeat(43)}`;
    await expect(ctx.authService.resetPassword({ token: forged, newPassword: "Reset-Passw0rd-42" }, meta)).rejects.toMatchObject({ code: "INVALID_RESET_TOKEN" });
    await expect(ctx.authService.resetPassword({ token, newPassword: "Reset-Passw0rd-42" }, meta)).resolves.toBeUndefined();
  });

  it("does not issue tokens for deactivated accounts, and rejects malformed tokens", async () => {
    const { email } = await createStaff(R.VIEWER, { isActive: false });
    await ctx.authService.requestPasswordReset({ email }, meta);
    expect(ctx.emailSender.sent).toHaveLength(0);
    await expect(ctx.authService.resetPassword({ token: "x".repeat(40), newPassword: "Reset-Passw0rd-42" }, meta)).rejects.toMatchObject({ code: "INVALID_RESET_TOKEN" });
  });

  it("enforces the password policy on the new password", async () => {
    const { email } = await createStaff(R.VIEWER);
    await ctx.authService.requestPasswordReset({ email }, meta);
    await expect(ctx.authService.resetPassword({ token: tokenFromEmail(ctx)!, newPassword: "weak" }, meta)).rejects.toThrow();
  });
});
