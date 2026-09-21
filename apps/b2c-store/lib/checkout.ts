import type { CheckoutIssue, OrderStatus, StoreCartLineInput, StoreOrder } from "@jewellery/types";
import { placeOrderSchema } from "@jewellery/validation";

/** Only what the customer chose. No prices, no totals of our own: the backend recalculates all of it. */
export type ContactForm = { fullName: string; email: string; phone: string; addressLine1: string; addressLine2: string; city: string; state: string; postalCode: string };
export const EMPTY_CONTACT: ContactForm = { fullName: "", email: "", phone: "", addressLine1: "", addressLine2: "", city: "", state: "", postalCode: "" };

const contactSchema = placeOrderSchema.shape.contact;

/** The same rules the API applies, so a mistake is caught while typing rather than after a round trip. */
export function validateContact(form: ContactForm): { ok: true; contact: ReturnType<typeof contactSchema.parse> } | { ok: false; errors: Partial<Record<keyof ContactForm, string>> } {
  const parsed = contactSchema.safeParse({ ...form, addressLine2: form.addressLine2 || undefined });
  if (parsed.success) return { ok: true, contact: parsed.data };
  const errors: Partial<Record<keyof ContactForm, string>> = {};
  for (const issue of parsed.error.issues) errors[issue.path[0] as keyof ContactForm] ??= issue.message;
  return { ok: false, errors };
}

export const toVerifyBody = (lines: StoreCartLineInput[], state: string | undefined, deliveryCode: string | undefined) => ({
  lines: lines.map((l) => ({ slug: l.slug, ...(l.variantSku ? { variantSku: l.variantSku } : {}), quantity: l.quantity })),
  ...(state ? { state } : {}),
  ...(deliveryCode ? { deliveryCode } : {}),
});

/** Same request → same signature → same idempotency key. */
export const requestSignature = (lines: StoreCartLineInput[], contact: object, deliveryCode: string) => JSON.stringify({ lines: toVerifyBody(lines, undefined, undefined).lines, contact, deliveryCode });

/** Issues that concern a line vs. the order as a whole. */
export const lineIssues = (issues: CheckoutIssue[]) => issues.filter((i) => i.slug);
/** The one issue that is simply "you haven't got to that step yet". */
export const blockingIssues = (issues: CheckoutIssue[]) => issues.filter((i) => i.code !== "DELIVERY_NOT_CHOSEN");

export type Tone = "good" | "warn" | "bad" | "neutral";
/** What to tell the customer about an order — words only; every fact comes from the order itself. */
export function describeOrder(o: Pick<StoreOrder, "status" | "payment" | "canPay">): { title: string; body: string; tone: Tone } {
  const refunded = o.payment && (o.payment.status === "REFUNDED" || o.payment.status === "PARTIALLY_REFUNDED");
  const copy: Record<OrderStatus, { title: string; body: string; tone: Tone }> = {
    DRAFT: { title: "Setting up your order", body: "One moment.", tone: "neutral" },
    PENDING_PAYMENT: { title: "Waiting for payment", body: o.canPay ? "Your pieces are set aside for you while you pay." : "The time we hold your pieces has run out.", tone: "warn" },
    PAYMENT_FAILED: { title: "Payment didn’t go through", body: o.canPay ? "Nothing was charged. Your pieces are still set aside — you can try again." : "Nothing was charged.", tone: "bad" },
    PAID: { title: "Payment received", body: "We’re confirming your order.", tone: "good" },
    CONFIRMED: { title: "Order confirmed", body: "Thank you. We’ll prepare your pieces for delivery.", tone: "good" },
    PACKED: { title: "Packed", body: "Your order is packed and ready to ship.", tone: "good" },
    SHIPPED: { title: "On its way", body: "Your order has been shipped.", tone: "good" },
    DELIVERED: { title: "Delivered", body: "Your order has been delivered.", tone: "good" },
    CANCELLED: { title: "Order cancelled", body: refunded ? "Your payment is being refunded." : o.payment?.status === "CAPTURED" ? "Your refund is being processed." : "Nothing was charged.", tone: "neutral" },
    RETURN_REQUESTED: { title: "Return requested", body: "We’ll be in touch about the return.", tone: "neutral" },
    RETURNED: { title: "Returned", body: "We’ve received your return.", tone: "neutral" },
    REFUNDED: { title: "Refunded", body: "Your money has been returned to your original payment method.", tone: "neutral" },
  };
  return copy[o.status];
}

export const isSettled = (status: OrderStatus) => status !== "DRAFT" && status !== "PENDING_PAYMENT";
