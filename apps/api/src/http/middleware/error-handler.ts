import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";
import { AppError } from "../../shared/errors";

const STATUS_BY_CODE: Record<string, number> = {
  UNAUTHENTICATED: 401,
  TOKEN_EXPIRED: 401,
  INVALID_CREDENTIALS: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  IMMUTABLE_RECORD: 409,
  ILLEGAL_TRANSITION: 409,
  INSUFFICIENT_STOCK: 409,
  CONCURRENT_MODIFICATION: 409,
  RESERVED_FOR_OTHER: 409,
  DUPLICATE_IDENTIFIER: 409,
  VALIDATION_ERROR: 400,
  INVALID_RESET_TOKEN: 400,
  INVALID_CURRENT_PASSWORD: 400,
  RATE_LIMITED: 429,
};

export const notFoundHandler: RequestHandler = (_req, res) => {
  res.status(404).json({ error: { code: "NOT_FOUND", message: "Route not found" } });
};

/**
 * One place that turns errors into responses. Anything unrecognised is a 500 with a generic
 * body — internal messages, stack traces and database errors never reach the client.
 */
export const errorHandler = (isProduction: boolean): ErrorRequestHandler => (err, req, res, _next) => {
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: { code: "VALIDATION_ERROR", message: "Invalid request", issues: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })) },
    });
  }
  if (err instanceof AppError) {
    const status = STATUS_BY_CODE[err.code] ?? 400;
    // Unknown codes default to 400; 5xx is reserved for genuinely unexpected failures.
    return res.status(status).json({ error: { code: err.code, message: err.message } });
  }
  if (err?.type === "entity.parse.failed") {
    return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Malformed JSON body" } });
  }
  if (err?.type === "entity.too.large") {
    return res.status(413).json({ error: { code: "PAYLOAD_TOO_LARGE", message: "Request body too large" } });
  }
  if (err?.name === "MulterError") {
    const tooLarge = err.code === "LIMIT_FILE_SIZE";
    return res.status(tooLarge ? 413 : 400).json({ error: { code: tooLarge ? "PAYLOAD_TOO_LARGE" : "VALIDATION_ERROR", message: tooLarge ? "File is too large" : "Invalid upload" } });
  }
  if (err?.name === "CastError") {
    return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Invalid identifier" } });
  }
  if (err?.code === 11000) {
    return res.status(409).json({ error: { code: "CONFLICT", message: "A record with these details already exists" } });
  }
  console.error(`[api] unhandled error (request ${req.ctx?.requestId})`, err);
  res.status(500).json({ error: { code: "INTERNAL_ERROR", message: isProduction ? "Internal server error" : String(err?.message ?? err) } });
};
