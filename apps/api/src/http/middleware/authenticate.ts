import type { RequestHandler } from "express";
import { AuthenticationError } from "../../shared/errors";
import type { AuthService } from "../../modules/auth/auth.service";
import { asyncHandler } from "./async-handler";
import "../context";

export function bearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const [scheme, token, ...rest] = header.split(" ");
  return scheme?.toLowerCase() === "bearer" && token && rest.length === 0 ? token : null;
}

/**
 * Establishes `req.auth` or rejects with 401. This is the ONLY thing that authenticates a
 * request; every protected route sits behind it. Nothing here (or anywhere) trusts anything
 * the client says about its own role or permissions.
 */
export const createAuthenticate = (authService: AuthService): RequestHandler =>
  asyncHandler(async (req, _res, next) => {
    const token = bearerToken(req.get("authorization"));
    if (!token) throw new AuthenticationError();
    req.auth = await authService.authenticate(token);
    next();
  });

/** Same, but lets anonymous requests through (used by logout, which must work with an expired token). */
export const createOptionalAuthenticate = (authService: AuthService): RequestHandler =>
  asyncHandler(async (req, _res, next) => {
    const token = bearerToken(req.get("authorization"));
    if (token) {
      try {
        req.auth = await authService.authenticate(token);
      } catch {
        req.auth = undefined;
      }
    }
    next();
  });
