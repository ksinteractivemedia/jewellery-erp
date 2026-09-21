import { z } from "zod";
import { zSlug } from "./slug";
import { storeCheckoutDetailsSchema } from "./storefront";

/** The 28 states and 8 union territories, in the spelling GST uses to decide intra- vs inter-state supply. */
export const INDIAN_STATES = [
  "Andaman and Nicobar Islands", "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chandigarh", "Chhattisgarh",
  "Dadra and Nagar Haveli and Daman and Diu", "Delhi", "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jammu and Kashmir",
  "Jharkhand", "Karnataka", "Kerala", "Ladakh", "Lakshadweep", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram",
  "Nagaland", "Odisha", "Puducherry", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh",
  "Uttarakhand", "West Bengal",
] as const;
const canonical = new Map<string, string>(INDIAN_STATES.map((s) => [s.toLowerCase(), s]));
/** Accepts any capitalisation and returns the canonical spelling; anything else is rejected. */
export const zIndianState = z
  .string()
  .trim()
  .transform((v, ctx) => {
    const found = canonical.get(v.toLowerCase().replace(/\s+/g, " ").replace(/^orissa$/, "odisha"));
    if (!found) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Choose your state from the list" });
    return found ?? v;
  });

/**
 * What a browser may tell the checkout about a bag: which pieces, how many, where to, and how. It may NOT tell it a price,
 * a discount, a total of its own making or how much stock exists — those keys are refused, not ignored, so a client that
 * tries is told, and a test can prove it (.strict()).
 */
const line = z.object({ slug: zSlug, variantSku: z.string().trim().min(1).max(60).optional(), quantity: z.number().int().min(1).max(10) }).strict();
const lines = z.array(line).min(1, "Your bag is empty").max(30);

export const checkoutVerifySchema = z.object({ lines, state: zIndianState.optional(), deliveryCode: z.string().trim().max(30).optional() }).strict();
export type CheckoutVerifyInput = z.output<typeof checkoutVerifySchema>;

export const placeOrderSchema = z
  .object({
    lines,
    contact: storeCheckoutDetailsSchema.extend({ state: zIndianState }),
    deliveryCode: z.string().trim().min(1).max(30),
    /** The total the customer was shown and agreed to (paise). It is a CHECK against the server's own figure, never used to price anything. */
    agreedTotal: z.number().int().min(0),
    /** One key per attempt: sending the same order twice (double-click, retry after a lost response) yields one order. */
    idempotencyKey: z.string().regex(/^[A-Za-z0-9_-]{16,80}$/),
  })
  .strict();
export type PlaceOrderInput = z.output<typeof placeOrderSchema>;

/** A same-site path to return the customer to after the payment page — never a full URL, so it cannot be an open redirect. */
export const initiatePaymentSchema = z.object({ returnPath: z.string().max(200).regex(/^\/(?!\/)[A-Za-z0-9\-._~/?=&%]*$/) }).strict();
export type InitiatePaymentInput = z.output<typeof initiatePaymentSchema>;

/** Whatever the payment page handed back to the browser (a signature, a payment id): passed to the provider to check, trusted for nothing. */
export const verifyPaymentSchema = z.object({ payload: z.record(z.string().max(500)).default({}) }).strict();
export const cancelOrderSchema = z.object({ reason: z.string().trim().max(200).optional() }).strict();
