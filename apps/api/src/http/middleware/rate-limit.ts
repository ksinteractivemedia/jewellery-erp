import type { RequestHandler } from "express";
import rateLimit from "express-rate-limit";
import type { AppConfig, RateLimitRule } from "../../config/app-config";
import { TooManyRequestsError } from "../../shared/errors";

/** In-memory per-IP limiter. Fine for one process; swap the store for Redis before running multiple API instances (architecture.md §8). */
function limiter(enabled: boolean, rule: RateLimitRule): RequestHandler {
  if (!enabled) return (_req, _res, next) => next();
  return rateLimit({
    windowMs: rule.windowMs,
    limit: rule.max,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, _res, next) => next(new TooManyRequestsError()),
  });
}

export function createRateLimiters(config: AppConfig) {
  return {
    login: limiter(config.rateLimit.enabled, config.rateLimit.login),
    forgotPassword: limiter(config.rateLimit.enabled, config.rateLimit.forgotPassword),
    storefrontWrite: limiter(config.rateLimit.enabled, config.rateLimit.storefrontWrite),
    webhook: limiter(config.rateLimit.enabled, config.rateLimit.webhook),
  };
}
