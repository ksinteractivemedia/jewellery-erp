import { z } from "zod";

export interface RateLimitRule {
  windowMs: number;
  max: number;
}

export interface AppConfig {
  env: "development" | "test" | "production";
  port: number;
  /** Origins allowed by CORS *and* by the cookie-endpoint CSRF origin check. */
  allowedOrigins: string[];
  trustProxy: boolean;
  auth: {
    accessSecret: string;
    accessTtlSeconds: number;
    issuer: string;
    audience: string;
    /** A refresh token unused for this long dies (sliding). */
    refreshIdleTtlDays: number;
    /** A session dies this long after login no matter what (absolute). */
    sessionAbsoluteTtlDays: number;
    bcryptRounds: number;
    maxFailedLogins: number;
    lockoutMinutes: number;
    passwordResetTtlMinutes: number;
    /** Base URL of the ERP web app — used to build password-reset links. */
    appBaseUrl: string;
    cookie: { name: string; secure: boolean; domain?: string };
  };
  media: {
    /** Local-disk storage root (dev / single-node). Replace the storage adapter for S3 in production. */
    dir: string;
    /** Absolute base URL browsers use to reach this API — media URLs are built from it. */
    publicBaseUrl: string;
  };
  rateLimit: { enabled: boolean; login: RateLimitRule; forgotPassword: RateLimitRule; storefrontWrite: RateLimitRule; webhook: RateLimitRule };
  checkout: {
    /** How long a customer's pieces are held while they pay. */
    reservationMinutes: number;
    /** Where the storefront lives — payment pages send customers back here (never taken from a request). */
    storeBaseUrl: string;
  };
}

const bool = z.enum(["true", "false"]).transform((v) => v === "true");

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().default(4000),
  ALLOWED_ORIGINS: z.string().default("http://localhost:3000"),
  TRUST_PROXY: bool.default("false"),
  JWT_ACCESS_SECRET: z.string().min(32, "JWT_ACCESS_SECRET must be at least 32 characters"),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  REFRESH_IDLE_TTL_DAYS: z.coerce.number().positive().default(7),
  SESSION_ABSOLUTE_TTL_DAYS: z.coerce.number().positive().default(30),
  BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(12),
  MAX_FAILED_LOGINS: z.coerce.number().int().positive().default(5),
  LOCKOUT_MINUTES: z.coerce.number().positive().default(15),
  PASSWORD_RESET_TTL_MINUTES: z.coerce.number().positive().default(30),
  APP_BASE_URL: z.string().url().default("http://localhost:3000"),
  COOKIE_SECURE: bool.optional(),
  COOKIE_DOMAIN: z.string().optional(),
  RATE_LIMIT_ENABLED: bool.default("true"),
  MEDIA_DIR: z.string().default("./.data/media"),
  API_PUBLIC_URL: z.string().url().optional(),
  CHECKOUT_RESERVATION_MINUTES: z.coerce.number().int().min(5).max(120).default(20),
  STORE_BASE_URL: z.string().url().default("http://localhost:3001"),
});

/** Parses and validates the environment once at boot — a bad/missing secret fails fast instead of at first login. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const e = envSchema.parse(env);
  const production = e.NODE_ENV === "production";
  return {
    env: e.NODE_ENV,
    port: e.PORT,
    allowedOrigins: e.ALLOWED_ORIGINS.split(",").map((o) => o.trim()).filter(Boolean),
    trustProxy: e.TRUST_PROXY,
    auth: {
      accessSecret: e.JWT_ACCESS_SECRET,
      accessTtlSeconds: e.ACCESS_TOKEN_TTL_SECONDS,
      issuer: "jewellery-erp",
      audience: "jewellery-erp-api",
      refreshIdleTtlDays: e.REFRESH_IDLE_TTL_DAYS,
      sessionAbsoluteTtlDays: e.SESSION_ABSOLUTE_TTL_DAYS,
      bcryptRounds: e.BCRYPT_ROUNDS,
      maxFailedLogins: e.MAX_FAILED_LOGINS,
      lockoutMinutes: e.LOCKOUT_MINUTES,
      passwordResetTtlMinutes: e.PASSWORD_RESET_TTL_MINUTES,
      appBaseUrl: e.APP_BASE_URL,
      // Secure cookies are the default in production; only dev over http may opt out.
      cookie: { name: "jerp_rt", secure: e.COOKIE_SECURE ?? production, domain: e.COOKIE_DOMAIN },
    },
    media: { dir: e.MEDIA_DIR, publicBaseUrl: e.API_PUBLIC_URL ?? `http://localhost:${e.PORT}` },
    rateLimit: {
      enabled: e.RATE_LIMIT_ENABLED,
      login: { windowMs: 15 * 60_000, max: 20 },
      forgotPassword: { windowMs: 60 * 60_000, max: 5 },
      // Public, unauthenticated endpoints that write (newsletter) or do real work (cart quotes).
      storefrontWrite: { windowMs: 60_000, max: 30 },
      // Unauthenticated by design (a signature proves the sender, not a session) — a per-IP cap is defense-in-depth
      // against flooding, generous enough that a provider's own legitimate retry bursts never trip it.
      webhook: { windowMs: 60_000, max: 120 },
    },
    checkout: { reservationMinutes: e.CHECKOUT_RESERVATION_MINUTES, storeBaseUrl: e.STORE_BASE_URL.replace(/\/$/, "") },
  };
}
