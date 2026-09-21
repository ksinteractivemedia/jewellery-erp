import type { StoreCheckoutVerification } from "@jewellery/types";
import { AppError } from "../../shared/errors";

/** The price changed between what the customer saw and what the backend now calculates. Nothing was created; `details` is the fresh verification. */
export class PriceChangedError extends AppError {
  constructor(verification: StoreCheckoutVerification, agreed: number) {
    super("The price has changed since you last looked. Please review the new total.", "PRICE_CHANGED", { verification, agreedTotal: agreed });
  }
}
/** Stock ran out (or was never enough) — at verification, or in the moment between verifying and holding. */
export class StockChangedError extends AppError {
  constructor(verification: StoreCheckoutVerification) {
    super("Some pieces are no longer available in the quantity you asked for.", "STOCK_CHANGED", { verification });
  }
}
/** Something else stops the order (a piece priced on request, no delivery option): not a race, so not retryable as-is. */
export class CheckoutBlockedError extends AppError {
  constructor(verification: StoreCheckoutVerification) {
    super("This bag can't be ordered online as it stands.", "CHECKOUT_BLOCKED", { verification });
  }
}
export class IdempotencyKeyReusedError extends AppError {
  constructor() {
    super("This request key was already used for a different order.", "IDEMPOTENCY_KEY_REUSED");
  }
}
export class HoldExpiredError extends AppError {
  constructor() {
    super("Your hold on these pieces has ended. Please place the order again.", "HOLD_EXPIRED");
  }
}
