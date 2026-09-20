import { Types } from "mongoose";
import type { AuthSession } from "@jewellery/types";
import { changePasswordSchema, forgotPasswordSchema, loginSchema, resetPasswordSchema, type ChangePasswordInput, type ForgotPasswordInput, type LoginInput, type ResetPasswordInput } from "@jewellery/validation";
import type { AppConfig } from "../../config/app-config";
import { AppError, AuthenticationError, DomainValidationError, InvalidResetTokenError } from "../../shared/errors";
import { AUDIT_ACTIONS, recordAudit, type AuditInput } from "../audit/audit.service";
import { resolveRolesAndPermissions, toAuthUser, type AuthContext } from "./authorization.service";
import type { EmailSender } from "./email";
import { PasswordResetTokenModel } from "./password-reset-token.model";
import { SessionModel, type SessionRevokeReason } from "./session.model";
import { findActiveSession, revokeAllSessionsForUser, revokeSession } from "./session.repository";
import { generateOpaqueToken, parseOpaqueToken, secretMatches, signAccessToken, verifyAccessToken } from "./tokens";
import { UserModel, type UserDocument } from "./user.model";
import { findUserWithCredentialsByEmail, recordLogin, registerFailedLogin, setPasswordHash } from "./user.repository";
import { hashPassword, verifyPassword } from "./user.service";

export interface RequestMeta {
  ip?: string;
  userAgent?: string;
  requestId?: string;
}

/** A freshly issued session. `refreshToken` goes in an httpOnly cookie, never in the JSON body. */
export interface IssuedSession {
  session: AuthSession;
  refreshToken: string;
}

const DAY_MS = 86_400_000;
const invalid = () => new AuthenticationError("Invalid credentials", "INVALID_CREDENTIALS");

export function createAuthService(deps: { config: AppConfig; emailSender: EmailSender }) {
  const cfg = deps.config.auth;

  const audit = (meta: RequestMeta, entry: Omit<AuditInput, "ip" | "userAgent" | "requestId">) =>
    recordAudit({ ...entry, ip: meta.ip, userAgent: meta.userAgent, requestId: meta.requestId });

  // Run a real bcrypt comparison when the account doesn't exist, so "unknown email" and
  // "wrong password" take the same time and can't be told apart by latency.
  let dummyHash: string | undefined;
  async function burnPasswordCheck(plain: string) {
    dummyHash ??= await hashPassword("timing-equalizer-Password1", cfg.bcryptRounds);
    await verifyPassword(plain, dummyHash);
  }

  async function buildSession(user: UserDocument, sessionId: string): Promise<AuthSession> {
    const [{ token, expiresIn }, { roles, permissions }] = await Promise.all([
      signAccessToken(cfg, { userId: String(user._id), sessionId }),
      resolveRolesAndPermissions(user.roleIds),
    ]);
    return {
      accessToken: token,
      expiresIn,
      user: toAuthUser({ userId: String(user._id), name: user.name, email: user.email, userType: user.userType, roles, permissions }),
    };
  }

  const idleExpiry = (from: number, absolute: Date) => new Date(Math.min(from + cfg.refreshIdleTtlDays * DAY_MS, absolute.getTime()));

  async function issueSession(user: UserDocument, meta: RequestMeta): Promise<IssuedSession> {
    const sessionId = new Types.ObjectId();
    const { token: refreshToken, secretHash } = generateOpaqueToken(sessionId.toString());
    const now = Date.now();
    const absoluteExpiresAt = new Date(now + cfg.sessionAbsoluteTtlDays * DAY_MS);
    await SessionModel.create({
      _id: sessionId,
      userId: user._id,
      refreshTokenHash: secretHash,
      lastUsedAt: new Date(now),
      idleExpiresAt: idleExpiry(now, absoluteExpiresAt),
      absoluteExpiresAt,
      purgeAt: new Date(absoluteExpiresAt.getTime() + 30 * DAY_MS),
      ip: meta.ip,
      userAgent: meta.userAgent?.slice(0, 512),
    } as never);
    return { session: await buildSession(user, sessionId.toString()), refreshToken };
  }

  return {
    /** Email + password. Every failure looks identical to the caller; the audit log records the real reason. */
    async login(input: LoginInput, meta: RequestMeta): Promise<IssuedSession> {
      const { email, password } = loginSchema.parse(input);
      const user = await findUserWithCredentialsByEmail(email);
      const deny = async (reason: string, actor?: UserDocument) => {
        await audit(meta, { action: AUDIT_ACTIONS.LOGIN, outcome: "FAILURE", actorId: actor ? String(actor._id) : undefined, actorEmail: email, metadata: { reason } });
        return invalid();
      };

      if (!user) {
        await burnPasswordCheck(password);
        throw await deny("unknown_user");
      }
      if (user.lockedUntil && user.lockedUntil > new Date()) {
        await burnPasswordCheck(password);
        throw await deny("account_locked", user);
      }
      const passwordOk = await verifyPassword(password, user.passwordHash);
      if (!user.isActive) throw await deny("account_inactive", user);
      if (!passwordOk) {
        const locked = await registerFailedLogin(String(user._id), cfg.maxFailedLogins, cfg.lockoutMinutes);
        throw await deny(locked ? "bad_password_account_now_locked" : "bad_password", user);
      }

      await recordLogin(String(user._id));
      const issued = await issueSession(user, meta);
      await audit(meta, { action: AUDIT_ACTIONS.LOGIN, outcome: "SUCCESS", actorId: String(user._id), actorEmail: user.email, metadata: { sessionId: issued.refreshToken.split(".")[0] } });
      return issued;
    },

    /**
     * Rotates the refresh token. Each refresh token is single-use: presenting one that has
     * already been rotated away means two parties hold it (theft or a replayed request), so the
     * whole session is revoked and the user must sign in again.
     */
    async refresh(presented: unknown, meta: RequestMeta): Promise<IssuedSession> {
      const parsed = parseOpaqueToken(presented);
      if (!parsed) throw new AuthenticationError();

      const session = await SessionModel.findById(parsed.id);
      if (!session || session.revokedAt) throw new AuthenticationError();

      const now = Date.now();
      if (session.idleExpiresAt.getTime() <= now || session.absoluteExpiresAt.getTime() <= now) {
        await revokeSession(parsed.id, "EXPIRED");
        throw new AuthenticationError();
      }

      if (!secretMatches(parsed.secret, session.refreshTokenHash)) {
        if (secretMatches(parsed.secret, session.previousRefreshTokenHash)) {
          await revokeSession(parsed.id, "REUSE_DETECTED");
          await audit(meta, { action: AUDIT_ACTIONS.SESSION_REUSE_DETECTED, outcome: "DENIED", actorId: String(session.userId), targetType: "session", targetId: parsed.id });
        }
        throw new AuthenticationError();
      }

      const user = await UserModel.findById(session.userId);
      if (!user || !user.isActive) {
        await revokeSession(parsed.id, "USER_DEACTIVATED");
        throw new AuthenticationError();
      }

      const { token: refreshToken, secretHash } = generateOpaqueToken(parsed.id);
      // Compare-and-swap on the current hash: of two concurrent refreshes with the same token, exactly one wins.
      const rotated = await SessionModel.findOneAndUpdate(
        { _id: parsed.id, refreshTokenHash: session.refreshTokenHash, revokedAt: null },
        { previousRefreshTokenHash: session.refreshTokenHash, refreshTokenHash: secretHash, lastUsedAt: new Date(now), idleExpiresAt: idleExpiry(now, session.absoluteExpiresAt), ip: meta.ip, userAgent: meta.userAgent?.slice(0, 512) }
      );
      if (!rotated) throw new AuthenticationError();

      return { session: await buildSession(user as UserDocument, parsed.id), refreshToken };
    },

    /** Idempotent. Accepts the refresh token (preferred) and/or the current access-token session id. */
    async logout(args: { refreshToken?: unknown; accessSessionId?: string }, meta: RequestMeta): Promise<void> {
      let sessionId: string | undefined;
      const parsed = parseOpaqueToken(args.refreshToken);
      if (parsed) {
        const s = await SessionModel.findById(parsed.id);
        if (s && (secretMatches(parsed.secret, s.refreshTokenHash) || secretMatches(parsed.secret, s.previousRefreshTokenHash))) sessionId = parsed.id;
      }
      sessionId ??= args.accessSessionId;
      if (!sessionId) return;
      const session = await SessionModel.findById(sessionId);
      if (!session) return;
      if (await revokeSession(sessionId, "LOGOUT")) {
        await audit(meta, { action: AUDIT_ACTIONS.LOGOUT, outcome: "SUCCESS", actorId: String(session.userId), targetType: "session", targetId: sessionId });
      }
    },

    async logoutAll(actor: AuthContext, meta: RequestMeta): Promise<number> {
      const count = await revokeAllSessionsForUser(actor.userId, "LOGOUT_ALL");
      await audit(meta, { action: AUDIT_ACTIONS.LOGOUT_ALL, outcome: "SUCCESS", actorId: actor.userId, actorEmail: actor.email, metadata: { sessionsRevoked: count } });
      return count;
    },

    /**
     * Validates an access token and resolves the full caller context. The JWT proves identity
     * and session; the session row (revocation) and the user/role rows (deactivation, role
     * changes) are re-read every time, so revocation is immediate rather than "within 15 min".
     */
    async authenticate(accessToken: string): Promise<AuthContext> {
      const { userId, sessionId } = await verifyAccessToken(cfg, accessToken);
      const session = await findActiveSession(sessionId, userId);
      if (!session) throw new AuthenticationError();
      const user = await UserModel.findById(userId);
      if (!user || !user.isActive) throw new AuthenticationError();
      const { roles, permissions } = await resolveRolesAndPermissions(user.roleIds);
      return { userId, sessionId, name: user.name, email: user.email, userType: user.userType, roles, permissions };
    },

    async changePassword(actor: AuthContext, input: ChangePasswordInput, meta: RequestMeta): Promise<void> {
      const { currentPassword, newPassword } = changePasswordSchema.parse(input);
      const user = await UserModel.findById(actor.userId);
      if (!user) throw new AuthenticationError();
      if (!(await verifyPassword(currentPassword, user.passwordHash))) {
        // A stolen access token must not be a free oracle for the current password.
        await registerFailedLogin(actor.userId, cfg.maxFailedLogins, cfg.lockoutMinutes);
        await audit(meta, { action: AUDIT_ACTIONS.PASSWORD_CHANGED, outcome: "FAILURE", actorId: actor.userId, metadata: { reason: "bad_current_password" } });
        throw new AppError("Current password is incorrect", "INVALID_CURRENT_PASSWORD");
      }
      if (await verifyPassword(newPassword, user.passwordHash)) throw new DomainValidationError("new password must differ from the current password");

      await setPasswordHash(actor.userId, await hashPassword(newPassword, cfg.bcryptRounds));
      const revoked = await revokeAllSessionsForUser(actor.userId, "PASSWORD_CHANGED", actor.sessionId);
      await audit(meta, { action: AUDIT_ACTIONS.PASSWORD_CHANGED, outcome: "SUCCESS", actorId: actor.userId, actorEmail: actor.email, metadata: { otherSessionsRevoked: revoked } });
      if (user.email) await deps.emailSender.sendPasswordChangedNotice({ to: user.email, name: user.name });
    },

    /**
     * Always resolves the same way whether or not the email exists (no account enumeration).
     * Only active accounts actually get a token; the audit log records which case it was.
     */
    async requestPasswordReset(input: ForgotPasswordInput, meta: RequestMeta): Promise<void> {
      const { email } = forgotPasswordSchema.parse(input);
      const user = await findUserWithCredentialsByEmail(email);
      if (!user || !user.isActive) {
        await audit(meta, { action: AUDIT_ACTIONS.PASSWORD_RESET_REQUESTED, outcome: "FAILURE", actorEmail: email, metadata: { reason: user ? "account_inactive" : "unknown_user" } });
        return;
      }
      // Only the newest emailed link works.
      await PasswordResetTokenModel.updateMany({ userId: user._id, usedAt: null }, { usedAt: new Date() });

      const id = new Types.ObjectId();
      const { token, secretHash } = generateOpaqueToken(id.toString());
      const expiresAt = new Date(Date.now() + cfg.passwordResetTtlMinutes * 60_000);
      await PasswordResetTokenModel.create({ _id: id, userId: user._id, tokenHash: secretHash, expiresAt, ip: meta.ip } as never);

      const resetUrl = `${cfg.appBaseUrl.replace(/\/$/, "")}/reset-password?token=${encodeURIComponent(token)}`;
      await deps.emailSender.sendPasswordReset({ to: user.email!, name: user.name, resetUrl, expiresAt });
      await audit(meta, { action: AUDIT_ACTIONS.PASSWORD_RESET_REQUESTED, outcome: "SUCCESS", actorId: String(user._id), actorEmail: user.email });
    },

    /** Single-use. On success every session is revoked — whoever had the old password is signed out everywhere. */
    async resetPassword(input: ResetPasswordInput, meta: RequestMeta): Promise<void> {
      const { token, newPassword } = resetPasswordSchema.parse(input);
      const reject = async (reason: string, userId?: string) => {
        await audit(meta, { action: AUDIT_ACTIONS.PASSWORD_RESET_REJECTED, outcome: "FAILURE", actorId: userId, metadata: { reason } });
        return new InvalidResetTokenError();
      };

      const parsed = parseOpaqueToken(token);
      if (!parsed) throw await reject("malformed");
      const record = await PasswordResetTokenModel.findById(parsed.id);
      if (!record) throw await reject("not_found");
      // Verify the secret BEFORE consuming, so knowing only the id can't burn someone else's token.
      if (!secretMatches(parsed.secret, record.tokenHash)) throw await reject("bad_secret", String(record.userId));

      const consumed = await PasswordResetTokenModel.findOneAndUpdate({ _id: parsed.id, usedAt: null, expiresAt: { $gt: new Date() } }, { usedAt: new Date() });
      if (!consumed) throw await reject(record.usedAt ? "already_used" : "expired", String(record.userId));

      const user = await UserModel.findById(record.userId);
      if (!user || !user.isActive) throw await reject("account_inactive", String(record.userId));

      await setPasswordHash(String(user._id), await hashPassword(newPassword, cfg.bcryptRounds));
      await PasswordResetTokenModel.updateMany({ userId: user._id, usedAt: null }, { usedAt: new Date() });
      const revoked = await revokeAllSessionsForUser(String(user._id), "PASSWORD_RESET");
      await audit(meta, { action: AUDIT_ACTIONS.PASSWORD_RESET_COMPLETED, outcome: "SUCCESS", actorId: String(user._id), actorEmail: user.email, metadata: { sessionsRevoked: revoked } });
      if (user.email) await deps.emailSender.sendPasswordChangedNotice({ to: user.email, name: user.name });
    },
  };
}

export type AuthService = ReturnType<typeof createAuthService>;
export type { SessionRevokeReason };
