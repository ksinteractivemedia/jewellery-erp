import { createHmac, timingSafeEqual } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { PaymentProvider, ProviderEvent, ProviderEventType, ProviderPaymentState } from "../src/modules/orders/payments/payment-provider";
import { PaymentProviderError, WebhookRejectedError } from "../src/modules/orders/payments/payment-provider";

/**
 * A DEVELOPMENT payment gateway. It behaves like a real one where it matters — an authoritative status the provider owns,
 * signed webhooks with event ids, redelivery, asynchronous refunds — so the order and payment code is exercised the way it will
 * be in production. It moves no money and is registered only by `dev:memory` and by tests; production registers no provider
 * (isolation.test.ts keeps `src/` from importing this file).
 */
export interface SandboxOptions {
  /** Shared secret that signs webhooks (the adapter and the "gateway" both know it, as with a real provider). */
  secret?: string;
  /** Base URL of the hosted payment page (see `startSandboxPaymentPage`). */
  payPageBaseUrl?: string;
  /** How refunds behave: instant, later-by-webhook, or rejected. */
  refundMode?: "SYNC" | "ASYNC" | "FAIL";
}

interface Record_ {
  ref: string;
  paymentId: string;
  amount: number;
  returnUrl: string;
  status: ProviderPaymentState["status"];
  method?: string;
  failureReason?: string;
  refunds: { ref: string; amount: number; status: "SUCCEEDED" | "PENDING" | "FAILED" }[];
}

export interface SandboxProvider extends PaymentProvider {
  /** What the gateway itself believes about a payment — the "truth" the tests then expect the order system to converge on. */
  peek(ref: string): Readonly<Record_> | undefined;
  /** The customer's outcome on the payment page. Changes the gateway's own state and returns the signed webhook it would send. */
  complete(ref: string, outcome: "CAPTURED" | "AUTHORIZED" | "FAILED", opts?: { amount?: number }): SignedWebhook;
  /** A signed webhook for any event, for tests (redelivery = send the same one twice). */
  signedEvent(type: ProviderEventType, ref: string, extra?: { eventId?: string; amount?: number; refundRef?: string; failureReason?: string }): SignedWebhook;
  /** Deliver the pending asynchronous refund's confirmation. */
  settleRefund(ref: string, refundRef: string, outcome: "SUCCEEDED" | "FAILED"): SignedWebhook;
  /** Make the next `initiate` fail, as if the gateway were down. */
  failNextInitiate(): void;
  setRefundMode(mode: NonNullable<SandboxOptions["refundMode"]>): void;
  readonly secret: string;
}
export interface SignedWebhook {
  body: string;
  headers: Record<string, string>;
}

export function createSandboxProvider(options: SandboxOptions = {}): SandboxProvider {
  const secret = options.secret ?? "sandbox-webhook-secret";
  let refundMode = options.refundMode ?? "SYNC";
  let failInitiate = false;
  let sequence = 0;
  const records = new Map<string, Record_>();
  const sign = (body: string) => createHmac("sha256", secret).update(body).digest("hex");
  const signed = (payload: object): SignedWebhook => {
    const body = JSON.stringify(payload);
    return { body, headers: { "x-sandbox-signature": sign(body) } };
  };
  const need = (ref: string) => {
    const r = records.get(ref);
    if (!r) throw new PaymentProviderError(`sandbox: unknown payment ${ref}`);
    return r;
  };
  const eventId = () => `evt_${++sequence}`;

  const provider: SandboxProvider = {
    code: "sandbox",
    secret,
    peek: (ref) => records.get(ref),
    failNextInitiate: () => void (failInitiate = true),
    setRefundMode: (mode) => void (refundMode = mode),

    async initiate(req) {
      if (failInitiate) {
        failInitiate = false;
        throw new PaymentProviderError("sandbox gateway is unavailable");
      }
      const ref = `sbx_pay_${req.paymentId}`;
      if (!records.has(ref)) records.set(ref, { ref, paymentId: req.paymentId, amount: req.amount, returnUrl: req.returnUrl, status: "PENDING", refunds: [] });
      const base = options.payPageBaseUrl ?? "http://localhost:4100";
      return { providerRef: ref, action: { type: "REDIRECT", url: `${base}/pay/${ref}` } };
    },

    async fetchStatus(ref) {
      const r = need(ref);
      return { status: r.status, amount: r.amount, currency: "INR", ...(r.method ? { method: r.method } : {}), ...(r.failureReason ? { failureReason: r.failureReason } : {}) };
    },

    parseWebhook(rawBody, headers) {
      const given = headers["x-sandbox-signature"];
      const expected = sign(rawBody);
      if (!given || given.length !== expected.length || !timingSafeEqual(Buffer.from(given), Buffer.from(expected))) throw new WebhookRejectedError();
      let p: { id?: string; type?: string; ref?: string; amount?: number; refundRef?: string; failureReason?: string; method?: string };
      try {
        p = JSON.parse(rawBody);
      } catch {
        throw new WebhookRejectedError("malformed webhook body");
      }
      if (!p.id || !p.ref || !p.type) throw new WebhookRejectedError("malformed webhook body");
      if (!["PAYMENT_AUTHORIZED", "PAYMENT_CAPTURED", "PAYMENT_FAILED", "REFUND_SUCCEEDED", "REFUND_FAILED"].includes(p.type)) return null;
      const event: ProviderEvent = {
        eventId: p.id,
        type: p.type as ProviderEventType,
        providerRef: p.ref,
        ...(p.amount !== undefined ? { amount: p.amount } : {}),
        ...(p.refundRef ? { refundRef: p.refundRef } : {}),
        ...(p.failureReason ? { failureReason: p.failureReason } : {}),
        ...(p.method ? { method: p.method } : {}),
      };
      return event;
    },

    async refund(req) {
      const r = need(req.providerRef);
      const ref = `sbx_refund_${r.ref}_${r.refunds.length + 1}`;
      if (refundMode === "FAIL") return { providerRefundRef: ref, status: "FAILED", failureReason: "sandbox refused the refund" };
      const status = refundMode === "SYNC" ? "SUCCEEDED" : "PENDING";
      r.refunds.push({ ref, amount: req.amount, status });
      return { providerRefundRef: ref, status };
    },

    async cancel(ref) {
      const r = need(ref);
      if (r.status === "PENDING" || r.status === "AUTHORIZED") {
        r.status = "FAILED";
        r.failureReason = "cancelled";
      }
    },

    complete(ref, outcome, opts = {}) {
      const r = need(ref);
      r.status = outcome;
      r.method = "sandbox-card";
      if (outcome === "FAILED") r.failureReason = "Card declined";
      const type: ProviderEventType = outcome === "CAPTURED" ? "PAYMENT_CAPTURED" : outcome === "AUTHORIZED" ? "PAYMENT_AUTHORIZED" : "PAYMENT_FAILED";
      return signed({ id: eventId(), type, ref, amount: opts.amount ?? r.amount, method: r.method, ...(r.failureReason && outcome === "FAILED" ? { failureReason: r.failureReason } : {}) });
    },

    signedEvent(type, ref, extra = {}) {
      return signed({ id: extra.eventId ?? eventId(), type, ref, ...(extra.amount !== undefined ? { amount: extra.amount } : {}), ...(extra.refundRef ? { refundRef: extra.refundRef } : {}), ...(extra.failureReason ? { failureReason: extra.failureReason } : {}) });
    },

    settleRefund(ref, refundRef, outcome) {
      const refund = need(ref).refunds.find((x) => x.ref === refundRef);
      if (refund) refund.status = outcome;
      return signed({ id: eventId(), type: outcome === "SUCCEEDED" ? "REFUND_SUCCEEDED" : "REFUND_FAILED", ref, refundRef });
    },
  };
  return provider;
}

/**
 * A hosted "payment page" for development, on its own port — the way a real gateway's checkout is somewhere else entirely.
 * The customer picks an outcome; the page tells the gateway, POSTs the signed webhook to the API, and sends the customer back.
 */
export function startSandboxPaymentPage(provider: SandboxProvider, opts: { port: number; webhookUrl: string }): Server {
  const page = (ref: string, amount: number) => `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sandbox payment</title>
<body style="font-family:system-ui;max-width:26rem;margin:4rem auto;padding:0 1rem"><p style="letter-spacing:.14em;font-size:.75rem;text-transform:uppercase;color:#a60">Sandbox gateway — no money moves</p>
<h1 style="font-weight:500">Pay ₹${(amount / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</h1>
<form method="post" action="/pay/${ref}" style="display:grid;gap:.75rem">
<button name="outcome" value="CAPTURED" style="padding:.9rem;background:#111;color:#fff;border:0;font-size:1rem;cursor:pointer">Pay successfully</button>
<button name="outcome" value="FAILED" style="padding:.9rem;border:1px solid #111;background:#fff;font-size:1rem;cursor:pointer">Fail the payment</button>
<button name="outcome" value="CANCEL" style="padding:.9rem;border:1px solid #ccc;background:#fff;font-size:1rem;cursor:pointer">Go back without paying</button></form>`;
  return createServer((req, res) => {
    const match = /^\/pay\/(sbx_pay_[A-Za-z0-9]+)$/.exec(req.url ?? "");
    const record = match ? provider.peek(match[1]!) : undefined;
    if (!match || !record) return void res.writeHead(404).end("Not found");
    if (req.method === "GET") return void res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(page(record.ref, record.amount));
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", async () => {
      const outcome = new URLSearchParams(body).get("outcome");
      const back = new URL(record.returnUrl);
      if (outcome === "CANCEL") back.searchParams.set("cancelled", "1");
      else if (outcome === "CAPTURED" || outcome === "FAILED") {
        const hook = provider.complete(record.ref, outcome);
        try {
          await fetch(opts.webhookUrl, { method: "POST", headers: { "content-type": "application/json", ...hook.headers }, body: hook.body });
        } catch {
          /* the API is down: the customer's return still asks the gateway what happened */
        }
      }
      back.searchParams.set("payment", record.paymentId);
      res.writeHead(303, { location: back.toString() }).end();
    });
  }).listen(opts.port);
}
