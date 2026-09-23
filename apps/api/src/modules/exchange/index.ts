/**
 * The exchange module: old jewellery → inspection → weight/purity assessment → valuation → new
 * product → difference payable/refundable. Unlike a Return, the old piece isn't necessarily anything
 * the business ever sold, so it's its own document (DRAFT → ASSESSED → COMPLETED, or CANCELLED
 * before the old piece is taken in) rather than reusing Return. Taking the old piece in posts a real
 * EXCHANGE_IN ledger entry, the same creation discipline as a purchase receipt.
 */
export * from "./exchange.models";
export * from "./exchange-status";
export type { Actor } from "./exchange-store";
export { nextNo } from "./exchange-store";

export * as exchanges from "./exchange.service";
export * as reads from "./exchange-reads.service";
