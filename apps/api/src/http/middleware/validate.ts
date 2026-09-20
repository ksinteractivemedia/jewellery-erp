import type { RequestHandler } from "express";
import type { ZodTypeAny } from "zod";

/** Replaces `req.body` with the parsed (and defaulted/coerced) value; a ZodError becomes a 400 in the error handler. */
export const validateBody = (schema: ZodTypeAny): RequestHandler => (req, _res, next) => {
  req.body = schema.parse(req.body ?? {});
  next();
};
