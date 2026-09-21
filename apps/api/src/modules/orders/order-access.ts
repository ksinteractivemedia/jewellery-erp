import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * A guest has no account, so what proves an order is theirs is a token handed to them when they placed it. It is an HMAC of
 * the order id under the server's secret, not a stored random value: nothing readable is kept in the database (CLAUDE.md
 * rule 10), it can be re-issued for a retried request (same idempotency key → same order → same token), and it cannot be
 * guessed from the order number. Domain-separated so it can never be mistaken for any other token signed with the secret.
 */
export function orderAccessToken(secret: string, orderId: string): string {
  return createHmac("sha256", secret).update(`order-access:v1:${orderId}`).digest("base64url");
}

export function isValidOrderAccessToken(secret: string, orderId: string, presented: string | undefined): boolean {
  if (!presented) return false;
  const expected = Buffer.from(orderAccessToken(secret, orderId));
  const given = Buffer.from(presented);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
