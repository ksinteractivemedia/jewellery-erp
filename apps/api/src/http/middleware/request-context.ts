import { randomUUID } from "node:crypto";
import type { RequestHandler } from "express";
import "../context";

export const requestContext: RequestHandler = (req, res, next) => {
  const incoming = req.get("x-request-id");
  const requestId = incoming && /^[\w-]{8,64}$/.test(incoming) ? incoming : randomUUID();
  req.ctx = { requestId, ip: req.ip, userAgent: req.get("user-agent") ?? undefined };
  res.setHeader("x-request-id", requestId);
  next();
};
