import type { PaymentAction, Paise } from "@jewellery/types";
import { AppError } from "../../../shared/errors";

/**
 * The seam between an order and whoever moves the money. Orders and the payment service speak ONLY this interface; nothing
 * about a particular gateway (its ids, its signature scheme, its checkout page) exists outside its adapter, so adding or
 * swapping one is a new file that implements this and is registered at boot — no order code changes.
 *
 * The provider is the authority on whether money moved. We never mark a payment captured because a browser said so: the
 * customer's return and the provider's webhook both end in `fetchStatus` / a signed `parseWebhook`.
 */
export interface PaymentProvider {
  /** Stable code stored on every payment ("razorpay", "sandbox"); also the webhook URL segment. */
  readonly code: string;

  /** Open a payment for `amount` and say what the customer must do to pay it. `idempotencyKey` makes a retry safe. */
  initiate(request: InitiatePayment): Promise<InitiatedPayment>;

  /**
   * What is the provider's view of this payment right now? Called when the customer comes back from paying, with whatever the
   * payment page handed the browser (`clientProof`), which the adapter must verify (signature) rather than trust.
   */
  fetchStatus(providerRef: string, clientProof?: Record<string, string>): Promise<ProviderPaymentState>;

  /**
   * Verify the signature of a webhook body and turn it into an event; throw `WebhookRejectedError` if it isn't authentic. Return
   * null for an event type we don't care about (acknowledged, not processed).
   */
  parseWebhook(rawBody: string, headers: Record<string, string | undefined>): ProviderEvent | null;

  /** Return money for a captured payment. Synchronous providers answer SUCCEEDED; asynchronous ones PENDING and confirm by webhook. */
  refund(request: RefundPayment): Promise<RefundResult>;

  /** Void a payment the customer abandoned so it cannot be completed later. Best effort. */
  cancel?(providerRef: string): Promise<void>;
}

export interface InitiatePayment {
  /** Our payment id: the provider echoes it so a webhook can be traced back even before we stored `providerRef`. */
  paymentId: string;
  orderNo: string;
  amount: Paise;
  currency: "INR";
  customer: { name: string; email: string; phone: string };
  /** Absolute URL the customer returns to after the payment page. */
  returnUrl: string;
  idempotencyKey: string;
}
export interface InitiatedPayment {
  providerRef: string;
  action: PaymentAction;
}

export interface ProviderPaymentState {
  status: "PENDING" | "AUTHORIZED" | "CAPTURED" | "FAILED";
  amount: Paise;
  currency: string;
  method?: string;
  failureReason?: string;
}

export type ProviderEventType = "PAYMENT_AUTHORIZED" | "PAYMENT_CAPTURED" | "PAYMENT_FAILED" | "REFUND_SUCCEEDED" | "REFUND_FAILED";
export interface ProviderEvent {
  /** Unique per delivery-worthy event at the provider; the same event redelivered carries the same id. */
  eventId: string;
  type: ProviderEventType;
  providerRef: string;
  /** For refund events. */
  refundRef?: string;
  amount?: Paise;
  currency?: string;
  method?: string;
  failureReason?: string;
}

export interface RefundPayment {
  providerRef: string;
  amount: Paise;
  reason: string;
  idempotencyKey: string;
}
export interface RefundResult {
  providerRefundRef: string;
  status: "SUCCEEDED" | "PENDING" | "FAILED";
  failureReason?: string;
}

/** The webhook was not signed by the provider (or is malformed). Answered 400; nothing is recorded as an event. */
export class WebhookRejectedError extends AppError {
  constructor(message = "Webhook signature is not valid") {
    super(message, "WEBHOOK_REJECTED");
  }
}
/** The provider could not be reached or refused. Answered 502; the payment stays as it was so the customer can try again. */
export class PaymentProviderError extends AppError {
  constructor(message: string) {
    super(message, "PAYMENT_PROVIDER_ERROR");
  }
}
/** No provider is registered (production until a gateway adapter is wired in). Answered 503 — checkout says so instead of pretending. */
export class PaymentsNotConfiguredError extends AppError {
  constructor() {
    super("Online payments are not available right now", "PAYMENTS_NOT_CONFIGURED");
  }
}

/** The set of adapters the app was started with. The first registered one is the default for new payments. */
export class PaymentProviders {
  private readonly byCode = new Map<string, PaymentProvider>();
  constructor(providers: readonly PaymentProvider[] = []) {
    for (const p of providers) this.byCode.set(p.code, p);
  }
  get isConfigured() {
    return this.byCode.size > 0;
  }
  default(): PaymentProvider {
    const first = this.byCode.values().next().value as PaymentProvider | undefined;
    if (!first) throw new PaymentsNotConfiguredError();
    return first;
  }
  get(code: string): PaymentProvider | undefined {
    return this.byCode.get(code);
  }
  require(code: string): PaymentProvider {
    const p = this.byCode.get(code);
    if (!p) throw new PaymentsNotConfiguredError();
    return p;
  }
}
