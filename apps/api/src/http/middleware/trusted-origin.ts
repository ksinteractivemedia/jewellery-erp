import type { RequestHandler } from "express";
import { AuthorizationError } from "../../shared/errors";

/**
 * CSRF defence for the cookie-authenticated endpoints (refresh, logout), on top of the
 * SameSite=Strict cookie. Browsers always send `Origin` on cross-origin POSTs; a request
 * carrying one that isn't ours is refused. Non-browser clients send none and pass through.
 */
export const requireTrustedOrigin = (allowedOrigins: string[]): RequestHandler => (req, _res, next) => {
  const origin = req.get("origin");
  if (origin && !allowedOrigins.includes(origin)) return next(new AuthorizationError("Untrusted origin"));
  next();
};
