import { Router, type Response } from "express";
import { changePasswordSchema, forgotPasswordSchema, loginSchema, resetPasswordSchema } from "@jewellery/validation";
import type { AppConfig } from "../../config/app-config";
import type { AuthService, IssuedSession } from "../../modules/auth/auth.service";
import { toAuthUser } from "../../modules/auth/authorization.service";
import { asyncHandler } from "../middleware/async-handler";
import { requireTrustedOrigin } from "../middleware/trusted-origin";
import { validateBody } from "../middleware/validate";
import type { RequestHandler } from "express";

interface Deps {
  config: AppConfig;
  authService: AuthService;
  authenticate: RequestHandler;
  optionalAuthenticate: RequestHandler;
  limiters: { login: RequestHandler; forgotPassword: RequestHandler };
}

export function createAuthRouter({ config, authService, authenticate, optionalAuthenticate, limiters }: Deps) {
  const router = Router();
  const cookie = config.auth.cookie;
  const cookieOptions = {
    httpOnly: true,
    secure: cookie.secure,
    sameSite: "strict" as const,
    path: "/api/auth",
    domain: cookie.domain,
  };

  const setRefreshCookie = (res: Response, token: string) =>
    res.cookie(cookie.name, token, { ...cookieOptions, maxAge: config.auth.refreshIdleTtlDays * 86_400_000 });
  const clearRefreshCookie = (res: Response) => res.clearCookie(cookie.name, cookieOptions);
  const sendSession = (res: Response, issued: IssuedSession) => {
    setRefreshCookie(res, issued.refreshToken);
    res.json(issued.session);
  };

  router.use((_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });

  router.post("/login", limiters.login, validateBody(loginSchema), asyncHandler(async (req, res) => {
    sendSession(res, await authService.login(req.body, req.ctx));
  }));

  router.post("/refresh", requireTrustedOrigin(config.allowedOrigins), asyncHandler(async (req, res) => {
    try {
      sendSession(res, await authService.refresh(req.cookies?.[cookie.name], req.ctx));
    } catch (error) {
      clearRefreshCookie(res); // a rejected token is dead — don't keep sending it
      throw error;
    }
  }));

  router.post("/logout", requireTrustedOrigin(config.allowedOrigins), optionalAuthenticate, asyncHandler(async (req, res) => {
    await authService.logout({ refreshToken: req.cookies?.[cookie.name], accessSessionId: req.auth?.sessionId }, req.ctx);
    clearRefreshCookie(res);
    res.status(204).end();
  }));

  router.post("/logout-all", authenticate, asyncHandler(async (req, res) => {
    await authService.logoutAll(req.auth!, req.ctx);
    clearRefreshCookie(res);
    res.status(204).end();
  }));

  router.get("/me", authenticate, (req, res) => {
    res.json({ user: toAuthUser(req.auth!) });
  });

  router.post("/change-password", authenticate, validateBody(changePasswordSchema), asyncHandler(async (req, res) => {
    await authService.changePassword(req.auth!, req.body, req.ctx);
    res.status(204).end();
  }));

  // Same 202 whether or not the email is registered — never confirm an account exists.
  router.post("/forgot-password", limiters.forgotPassword, validateBody(forgotPasswordSchema), asyncHandler(async (req, res) => {
    await authService.requestPasswordReset(req.body, req.ctx);
    res.status(202).json({ message: "If that email is registered, a reset link has been sent." });
  }));

  router.post("/reset-password", limiters.forgotPassword, validateBody(resetPasswordSchema), asyncHandler(async (req, res) => {
    await authService.resetPassword(req.body, req.ctx);
    clearRefreshCookie(res);
    res.status(204).end();
  }));

  return router;
}
