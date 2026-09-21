import type { AuthContext } from "../modules/auth/authorization.service";

export interface RequestContext {
  requestId: string;
  ip?: string;
  userAgent?: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      ctx: RequestContext;
      /** Set by `authenticate`. Absent on unauthenticated routes. */
      auth?: AuthContext;
      /** The exact bytes of a webhook body, kept so its signature can be verified. Only set for payment webhooks. */
      rawBody?: string;
    }
  }
}
