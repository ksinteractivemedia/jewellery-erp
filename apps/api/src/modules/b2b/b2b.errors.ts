import type { B2BResolvedLine, CreditCheck } from "@jewellery/types";
import { AppError } from "../../shared/errors";

/** The order as asked can't be placed: an unknown SKU, a design not offered, a quantity under the minimum. */
export class OrderBlockedError extends AppError {
  constructor(lines: B2BResolvedLine[]) {
    super("Some lines can't be ordered as they are.", "ORDER_BLOCKED", { lines });
  }
}
/** The credit rule said no, and the caller has no override (or gave no reason). The check says exactly why and what to do. */
export class CreditBlockedError extends AppError {
  constructor(check: CreditCheck) {
    super(check.reasons.map((r) => r.message).join(" ") || "Credit approval is required.", "CREDIT_BLOCKED", { check });
  }
}
export class StockShortError extends AppError {
  constructor(shortfall: { sku: string; name: string; wanted: number; available: number }[]) {
    super("There isn't enough stock to allocate this order.", "STOCK_SHORT", { shortfall });
  }
}
/** Whoever entered a payment cannot be the one who confirms it arrived. */
export class SelfVerificationError extends AppError {
  constructor() {
    super("A payment must be verified by someone other than the person who recorded it.", "SELF_VERIFICATION");
  }
}
export class QuotationExpiredError extends AppError {
  constructor() {
    super("This quotation has expired. Please ask for a new one.", "QUOTE_EXPIRED");
  }
}
