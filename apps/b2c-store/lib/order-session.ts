/**
 * A guest has no account, so what proves an order is theirs is the access token the API returns when it is placed. It is kept
 * for the browser tab only (sessionStorage — it survives the trip to the payment page and back in the same tab, and is gone when
 * the tab closes). It is the customer's own key to their own order; it is never a price, and never sent anywhere but our API.
 */
const PREFIX = "suvarna.order.";
const safe = <T,>(fn: () => T, fallback: T): T => {
  try {
    return typeof window === "undefined" ? fallback : fn();
  } catch {
    return fallback; // storage blocked: the page then says it can't show the order on this device
  }
};

export const orderTokens = {
  get: (orderNo: string): string | null => safe(() => window.sessionStorage.getItem(PREFIX + orderNo), null),
  set: (orderNo: string, token: string) => safe(() => window.sessionStorage.setItem(PREFIX + orderNo, token), undefined),
};

/** One idempotency key per distinct request: retrying the SAME order (double-click, lost response) reuses it; changing anything makes a new one. */
const attempt: { signature?: string; key?: string } = {};
export function attemptKey(signature: string): string {
  if (attempt.signature !== signature || !attempt.key) {
    attempt.signature = signature;
    attempt.key = `${Date.now().toString(36)}-${typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2)}`.slice(0, 80);
  }
  return attempt.key;
}
