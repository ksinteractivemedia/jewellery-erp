import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * The same guest-access pattern as orders (`modules/orders/order-access.ts`), generalised: a guest
 * has no account, so what proves a return/repair/exchange record is theirs is a token handed to them
 * when it was created. An HMAC of the resource's id under the server's secret, domain-separated by
 * `domain` so a token minted for one kind of record (or for an order) can never be replayed against
 * another — nothing readable is stored (CLAUDE.md rule 10), and it can be recomputed identically
 * every time, so re-showing it costs nothing.
 */
export function resourceAccessToken(secret: string, domain: string, id: string): string {
  return createHmac("sha256", secret).update(`${domain}:v1:${id}`).digest("base64url");
}

export function isValidResourceAccessToken(secret: string, domain: string, id: string, presented: string | undefined): boolean {
  if (!presented) return false;
  const expected = Buffer.from(resourceAccessToken(secret, domain, id));
  const given = Buffer.from(presented);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
