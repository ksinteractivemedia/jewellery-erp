import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { SignJWT, errors, jwtVerify } from "jose";
import type { AppConfig } from "../../config/app-config";
import { AuthenticationError } from "../../shared/errors";

type AuthConfig = AppConfig["auth"];

const key = (cfg: AuthConfig) => new TextEncoder().encode(cfg.accessSecret);

export interface AccessTokenClaims {
  userId: string;
  sessionId: string;
}

/**
 * Access tokens are short-lived, stateless-to-verify JWTs that carry *identity only* (user +
 * session). Roles/permissions are deliberately NOT embedded: they are resolved from the
 * database on every request, so a role change or deactivation takes effect immediately
 * instead of surviving until the token expires.
 */
export async function signAccessToken(cfg: AuthConfig, claims: AccessTokenClaims): Promise<{ token: string; expiresIn: number }> {
  const token = await new SignJWT({ sid: claims.sessionId })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(claims.userId)
    .setIssuer(cfg.issuer)
    .setAudience(cfg.audience)
    .setJti(randomBytes(12).toString("hex"))
    .setIssuedAt()
    .setExpirationTime(`${cfg.accessTtlSeconds}s`)
    .sign(key(cfg));
  return { token, expiresIn: cfg.accessTtlSeconds };
}

export async function verifyAccessToken(cfg: AuthConfig, token: string): Promise<AccessTokenClaims> {
  try {
    // `algorithms` pins HS256: an `alg: none` or RS256-confusion token is rejected outright.
    const { payload } = await jwtVerify(token, key(cfg), { algorithms: ["HS256"], issuer: cfg.issuer, audience: cfg.audience });
    if (typeof payload.sub !== "string" || typeof payload.sid !== "string") throw new AuthenticationError();
    return { userId: payload.sub, sessionId: payload.sid };
  } catch (error) {
    if (error instanceof AuthenticationError) throw error;
    if (error instanceof errors.JWTExpired) throw new AuthenticationError("Access token expired", "TOKEN_EXPIRED");
    throw new AuthenticationError();
  }
}

export const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

/** Opaque tokens are `<recordId>.<secret>`: the id makes lookup O(1); only a hash of the secret is stored. */
export function generateOpaqueToken(recordId: string): { token: string; secretHash: string } {
  const secret = randomBytes(32).toString("base64url");
  return { token: `${recordId}.${secret}`, secretHash: sha256(secret) };
}

export function parseOpaqueToken(token: unknown): { id: string; secret: string } | null {
  if (typeof token !== "string" || token.length > 200) return null;
  const dot = token.indexOf(".");
  if (dot !== 24) return null;
  const id = token.slice(0, dot);
  const secret = token.slice(dot + 1);
  if (!/^[0-9a-f]{24}$/.test(id) || !/^[A-Za-z0-9_-]{20,}$/.test(secret)) return null;
  return { id, secret };
}

/** Constant-time comparison of a presented secret against a stored hash. */
export function secretMatches(secret: string, storedHash: string | undefined): boolean {
  if (!storedHash) return false;
  const a = Buffer.from(sha256(secret), "hex");
  const b = Buffer.from(storedHash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}
