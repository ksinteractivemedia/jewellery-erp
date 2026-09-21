"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, Loader2 } from "lucide-react";
import type { StoreCheckoutVerification } from "@jewellery/types";
import { INDIAN_STATES } from "@jewellery/validation";
import { Skeleton, cn } from "@jewellery/ui";
import { StoreApiError } from "../../lib/api";
import { cart, useCartLines } from "../../lib/cart";
import { EMPTY_CONTACT, blockingIssues, requestSignature, toVerifyBody, validateContact, type ContactForm } from "../../lib/checkout";
import { checkoutKeys, placeOrder, startPayment, useCheckoutVerification } from "../../lib/checkout-api";
import { formatMoney } from "../../lib/money";
import { attemptKey, orderTokens } from "../../lib/order-session";
import { EditBag, Totals, VerifiedLines } from "./order-lines";

type Step = "address" | "delivery" | "review";
const STEPS: { id: Step | "payment"; label: string }[] = [{ id: "address", label: "Address" }, { id: "delivery", label: "Delivery" }, { id: "review", label: "Review" }, { id: "payment", label: "Payment" }];

/**
 * Bag → Address → Delivery → Review (the backend's own recalculation) → Payment (on the gateway's page) → Confirmation.
 * This component only carries choices to the API and shows its answers: prices, totals, stock and delivery fees arrive from
 * `/checkout/verify`, and the total the customer sees on the Review step is what they are asked to agree to — the API refuses
 * the order (PRICE_CHANGED) if the truth has moved since.
 */
export function CheckoutFlow() {
  const router = useRouter();
  const qc = useQueryClient();
  const lines = useCartLines();
  const [step, setStep] = React.useState<Step>("address");
  const [form, setForm] = React.useState<ContactForm>(EMPTY_CONTACT);
  const [touched, setTouched] = React.useState<Set<string>>(new Set());
  const [deliveryCode, setDeliveryCode] = React.useState<string>();
  const [placing, setPlacing] = React.useState<"idle" | "placing" | "redirecting">("idle");
  const [failure, setFailure] = React.useState<string>();
  const [notice, setNotice] = React.useState<{ from: number; to: number }>();

  const checked = validateContact(form);
  const errors = checked.ok ? {} : checked.errors;
  const touch = (k: string) => setTouched((t) => new Set(t).add(k));
  const state = checked.ok || !form.state ? (checked.ok ? checked.contact.state : undefined) : undefined;
  const verification = useCheckoutVerification(lines, state, deliveryCode, lines.length > 0 && placing !== "redirecting");
  const v = verification.data;
  const verifyKey = checkoutKeys.verify(toVerifyBody(lines, state, deliveryCode));

  // Keep the chosen delivery option only while the backend still offers it.
  React.useEffect(() => {
    if (v && deliveryCode && !v.deliveryOptions.some((o) => o.code === deliveryCode)) setDeliveryCode(undefined);
  }, [v, deliveryCode]);

  const field = (key: keyof ContactForm, label: string, opts: { type?: string; autoComplete?: string; inputMode?: "text" | "numeric" | "tel" | "email"; optional?: boolean; className?: string; maxLength?: number } = {}) => {
    const shown = touched.has(key) && errors[key];
    return (
      <div className={cn("flex flex-col gap-1.5", opts.className)}>
        <label htmlFor={`co-${key}`} className="text-[0.75rem] font-medium uppercase tracking-[0.12em]">{label}{opts.optional && <span className="ml-1 normal-case tracking-normal text-muted">(optional)</span>}</label>
        <input id={`co-${key}`} name={key} type={opts.type ?? "text"} autoComplete={opts.autoComplete} inputMode={opts.inputMode} maxLength={opts.maxLength} value={form[key]} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} onBlur={() => touch(key)} aria-invalid={shown ? true : undefined} aria-describedby={shown ? `co-${key}-err` : undefined} className="h-12 border border-border bg-background px-4 text-body focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-[invalid=true]:border-danger" data-testid={`co-${key}`} />
        {shown && <p id={`co-${key}-err`} className="text-caption text-danger" role="alert">{shown}</p>}
      </div>
    );
  };

  if (placing === "redirecting") {
    return <div className="flex flex-col items-center gap-4 py-24 text-center" role="status" data-testid="taking-to-payment"><Loader2 className="h-8 w-8 animate-spin" aria-hidden="true" /><h2 className="font-display text-h2">Taking you to payment…</h2><p className="text-body text-muted">Your pieces are set aside for you while you pay.</p></div>;
  }
  if (lines.length === 0) {
    return <div className="flex flex-col items-center gap-5 py-24 text-center" data-testid="checkout-empty"><h2 className="font-display text-h2">There’s nothing to check out</h2><p className="text-body text-muted">Add a piece to your bag first.</p><Link href="/collections" className="btn btn-primary">Explore collections</Link></div>;
  }

  const goDelivery = () => {
    setTouched(new Set(Object.keys(EMPTY_CONTACT)));
    if (checked.ok) setStep("delivery");
  };

  const place = async () => {
    if (!checked.ok || !v || !deliveryCode) return;
    setFailure(undefined);
    setPlacing("placing");
    const contact = { ...checked.contact };
    try {
      const { order, accessToken } = await placeOrder({
        lines: toVerifyBody(lines, undefined, undefined).lines,
        contact,
        deliveryCode,
        agreedTotal: v.totals.total, // the total this customer was shown — the API only compares it with its own
        idempotencyKey: attemptKey(requestSignature(lines, contact, deliveryCode)),
      });
      orderTokens.set(order.orderNo, accessToken);
      cart.clear(); // the pieces are held for this order now
      try {
        const { payment } = await startPayment(order.orderNo, accessToken, `/checkout/return?order=${order.orderNo}`);
        if (payment.action.type === "REDIRECT") {
          setPlacing("redirecting");
          window.location.assign(payment.action.url);
          return;
        }
      } catch {
        /* the order exists; the order page lets them pay from there */
      }
      router.push(`/orders/${order.orderNo}`);
    } catch (error) {
      setPlacing("idle");
      if (error instanceof StoreApiError && (error.code === "PRICE_CHANGED" || error.code === "STOCK_CHANGED" || error.code === "CHECKOUT_BLOCKED")) {
        const details = error.details as { verification: StoreCheckoutVerification; agreedTotal?: number };
        qc.setQueryData(verifyKey, details.verification);
        if (error.code === "PRICE_CHANGED") setNotice({ from: details.agreedTotal ?? v.totals.total, to: details.verification.totals.total });
        else setFailure(error.message);
      } else setFailure(error instanceof StoreApiError ? error.message : "We couldn’t place your order. Please try again.");
    }
  };

  const stepIndex = STEPS.findIndex((s) => s.id === step);
  const issues = v ? blockingIssues(v.issues) : [];
  const supplyType = v?.supplyType;

  return (
    <div className="flex flex-col gap-10" data-testid="checkout">
      <ol className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[0.75rem] font-medium uppercase tracking-[0.12em]" aria-label="Checkout steps" data-testid="steps">
        <li><Link href="/cart" className="text-muted hover:text-foreground">Bag</Link></li>
        {STEPS.map((s, i) => (
          <li key={s.id} className={cn("flex items-center gap-3", i > stepIndex && "text-muted")} aria-current={i === stepIndex ? "step" : undefined}>
            <span aria-hidden="true" className="text-muted">/</span>
            {i < stepIndex ? <button type="button" className="inline-flex items-center gap-1 text-muted hover:text-foreground" onClick={() => setStep(s.id as Step)}><Check className="h-3.5 w-3.5" aria-hidden="true" />{s.label}</button> : <span className={i === stepIndex ? "border-b border-foreground" : undefined}>{s.label}</span>}
          </li>
        ))}
      </ol>

      <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_420px] lg:gap-16">
        <div className="flex flex-col gap-10">
          {step === "address" && (
            <form onSubmit={(e) => { e.preventDefault(); goDelivery(); }} noValidate className="flex flex-col gap-10" aria-label="Contact and address" data-testid="step-address">
              <fieldset className="flex flex-col gap-5"><legend className="mb-1 font-display text-h3">Contact</legend>
                <div className="grid gap-5 sm:grid-cols-2">{field("fullName", "Full name", { autoComplete: "name" })}{field("phone", "Mobile number", { type: "tel", autoComplete: "tel-national", inputMode: "tel" })}</div>
                {field("email", "Email", { type: "email", autoComplete: "email", inputMode: "email" })}
              </fieldset>
              <fieldset className="flex flex-col gap-5"><legend className="mb-1 font-display text-h3">Delivery address</legend>
                {field("addressLine1", "Address", { autoComplete: "address-line1" })}
                {field("addressLine2", "Apartment, landmark", { autoComplete: "address-line2", optional: true })}
                <div className="grid gap-5 sm:grid-cols-3">
                  {field("city", "City", { autoComplete: "address-level2" })}
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="co-state" className="text-[0.75rem] font-medium uppercase tracking-[0.12em]">State</label>
                    <select id="co-state" name="state" autoComplete="address-level1" value={form.state} onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))} onBlur={() => touch("state")} aria-invalid={touched.has("state") && errors.state ? true : undefined} className="h-12 border border-border bg-background px-3 text-body focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" data-testid="co-state">
                      <option value="">Choose…</option>
                      {INDIAN_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                    {touched.has("state") && errors.state && <p className="text-caption text-danger" role="alert">{errors.state}</p>}
                  </div>
                  {field("postalCode", "PIN code", { autoComplete: "postal-code", inputMode: "numeric", maxLength: 6 })}
                </div>
              </fieldset>
              <button type="submit" className="btn btn-primary w-full sm:w-auto sm:self-start" data-testid="to-delivery">Continue to delivery</button>
            </form>
          )}

          {step === "delivery" && (
            <section className="flex flex-col gap-6" aria-labelledby="delivery-h" data-testid="step-delivery">
              <h2 id="delivery-h" className="font-display text-h3">How would you like it delivered?</h2>
              {!v ? <Skeleton className="h-32" /> : v.deliveryOptions.length === 0 ? (
                <p className="border border-border p-5 text-body text-muted" role="alert" data-testid="no-delivery">Delivery hasn’t been set up yet, so this order can’t be placed online. Please contact us.</p>
              ) : (
                <div role="radiogroup" aria-label="Delivery options" className="flex flex-col gap-3">
                  {v.deliveryOptions.map((o) => (
                    <label key={o.code} className={cn("flex cursor-pointer items-start justify-between gap-4 border p-5 transition-colors", deliveryCode === o.code ? "border-foreground bg-surface" : "border-border hover:border-foreground")}>
                      <span className="flex items-start gap-3">
                        <input type="radio" name="delivery" value={o.code} checked={deliveryCode === o.code} onChange={() => setDeliveryCode(o.code)} className="mt-1 h-4 w-4 accent-[var(--color-primary)]" data-testid={`delivery-${o.code}`} />
                        <span className="flex flex-col"><span className="font-medium">{o.label}</span>{o.estimate && <span className="text-body-sm text-muted">{o.estimate}</span>}</span>
                      </span>
                      <span className="tabular text-body">{o.fee === 0 ? "Free" : formatMoney(o.fee)}</span>
                    </label>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap gap-3">
                <button type="button" className="btn btn-outline" onClick={() => setStep("address")}>Back</button>
                <button type="button" className="btn btn-primary" disabled={!deliveryCode} onClick={() => setStep("review")} data-testid="to-review">Review your order</button>
              </div>
            </section>
          )}

          {step === "review" && (
            <section className="flex flex-col gap-8" aria-labelledby="review-h" data-testid="step-review">
              <h2 id="review-h" className="font-display text-h3">Review and pay</h2>

              {notice && (
                <div className="flex gap-4 border border-primary bg-surface p-5" role="alert" data-testid="price-changed">
                  <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                  <div className="flex flex-col gap-1"><p className="font-medium">The price has changed.</p><p className="text-body-sm text-muted">Your total was {formatMoney(notice.from)}; it is now <strong className="text-foreground">{formatMoney(notice.to)}</strong>, because prices follow today’s metal rate. Nothing has been charged. Please review it and confirm.</p></div>
                </div>
              )}
              {failure && <div className="border border-danger p-5 text-body-sm" role="alert" data-testid="checkout-failure">{failure}</div>}
              {issues.length > 0 && (
                <ul className="flex flex-col gap-2 border border-border p-5 text-body-sm" role="alert" data-testid="checkout-issues">
                  {issues.map((i, n) => <li key={n} className="flex gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{i.message}</li>)}
                  <li><Link href="/cart" className="link-quiet">Edit your bag</Link></li>
                </ul>
              )}

              <dl className="grid gap-6 border-y border-border-subtle py-6 text-body-sm sm:grid-cols-2">
                <div className="flex flex-col gap-1"><dt className="eyebrow">Deliver to</dt><dd>{form.fullName}<br />{form.addressLine1}{form.addressLine2 && <>, {form.addressLine2}</>}<br />{form.city}, {form.state} {form.postalCode}<br />{form.phone} · {form.email}</dd><dd><button type="button" className="link-quiet text-muted" onClick={() => setStep("address")}>Change</button></dd></div>
                <div className="flex flex-col gap-1"><dt className="eyebrow">Delivery</dt><dd>{v?.delivery ? <>{v.delivery.label}{v.delivery.estimate && <><br /><span className="text-muted">{v.delivery.estimate}</span></>}</> : "—"}</dd><dd><button type="button" className="link-quiet text-muted" onClick={() => setStep("delivery")}>Change</button></dd></div>
              </dl>

              <p className="text-body-sm leading-relaxed text-muted" data-testid="price-promise">
                {v ? <>These prices were calculated just now from today’s metal rate. You will pay exactly <strong className="text-foreground">{formatMoney(v.totals.total)}</strong> — if the rate moves before you order, we’ll show you the new total first.</> : "Checking today’s prices…"}
              </p>
              <div className="flex flex-col gap-3">
                <button type="button" className="btn btn-primary w-full sm:w-auto sm:self-start" disabled={!v?.canPlaceOrder || placing !== "idle" || verification.isFetching} onClick={place} data-testid="place-order">
                  {placing === "placing" ? <><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Placing your order…</> : notice ? `Accept new total and pay ${v ? formatMoney(v.totals.total) : ""}` : `Place order and pay ${v ? formatMoney(v.totals.total) : ""}`}
                </button>
                <p className="text-caption text-muted">You’ll pay on our payment partner’s page. We hold your pieces while you do.</p>
              </div>
            </section>
          )}
        </div>

        <aside className="flex h-fit flex-col gap-5 bg-surface p-6 sm:p-8 lg:sticky lg:top-28" aria-label="Order summary" data-testid="checkout-summary">
          <h2 className="font-display text-h3">Your order</h2>
          {!v ? <Skeleton className="h-40" /> : (
            <>
              <VerifiedLines lines={v.lines} />
              <Totals totals={v.totals} supplyType={supplyType} deliveryLabel={v.delivery?.label} testId="checkout" />
              <p className="text-caption leading-relaxed text-muted">Prices follow the metal rate and are recalculated by us each time you look.</p>
            </>
          )}
          <EditBag />
        </aside>
      </div>
    </div>
  );
}
