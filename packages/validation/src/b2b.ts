import { z } from "zod";
import { zAddress, zId } from "./common";
/** Kept in step with B2B_PAYMENT_METHODS in @jewellery/types (a test asserts they agree): validation does not depend on types. */
const B2B_PAYMENT_METHODS = ["BANK_TRANSFER", "NEFT", "RTGS", "IMPS", "CHEQUE", "CASH", "OTHER"] as const;

const text = (max: number) => z.string().trim().min(1).max(max);
const paise = z.number().int().positive().max(100_000_000_000);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "use YYYY-MM-DD");

// ---- profile (seller-side) ------------------------------------------------------------------------
export const b2bContactSchema = z.object({
  name: text(80),
  email: z.string().trim().toLowerCase().email().optional(),
  phone: z.string().trim().min(6).max(20).optional(),
  designation: text(60).optional(),
  isPrimary: z.boolean().default(false),
});
export const updateB2BProfileSchema = z
  .object({
    contacts: z.array(b2bContactSchema).max(10).optional(),
    creditLimit: z.number().int().min(0).max(100_000_000_000).optional(),
    paymentTermsDays: z.number().int().min(0).max(365).optional(),
    priceListCode: z.string().trim().min(1).max(40).nullable().optional(),
    salespersonId: zId.nullable().optional(),
    territory: text(60).nullable().optional(),
    creditHold: z.boolean().optional(),
    blockOnOverdue: z.boolean().optional(),
    gstin: z.string().regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, "must be a valid GSTIN").optional(),
    customerGroupId: zId.nullable().optional(),
    billingAddress: zAddress.optional(),
    shippingAddresses: z.array(zAddress).max(20).optional(),
  })
  .strict();
export type UpdateB2BProfileInput = z.output<typeof updateB2BProfileSchema>;

// ---- what a buyer may say -------------------------------------------------------------------------
/** A line is WHICH SKU and HOW MANY. A price, discount or total in a request is refused (.strict()). */
export const portalLineSchema = z.object({ sku: z.string().trim().min(1).max(60), quantity: z.number().int().min(1).max(100_000) }).strict();

export const quickOrderResolveSchema = z.object({ rows: z.array(portalLineSchema).min(1).max(200), shippingAddressIndex: z.number().int().min(0).max(19).optional() }).strict();
export const cartQuoteSchema = quickOrderResolveSchema;

export const createPurchaseOrderSchema = z
  .object({
    lines: z.array(portalLineSchema).min(1).max(200),
    shippingAddressIndex: z.number().int().min(0).max(19),
    customerPoRef: text(60).optional(),
    notes: text(1000).optional(),
    requestedDeliveryDate: day.optional(),
    /** false saves a draft; true submits it to the seller for review. */
    submit: z.boolean(),
  })
  .strict();
export type CreatePurchaseOrderInput = z.output<typeof createPurchaseOrderSchema>;

export const counterOfferSchema = z
  .object({ message: text(1000), requestedPrices: z.array(z.object({ sku: z.string().trim().min(1).max(60), unitTaxable: paise }).strict()).max(200).optional() })
  .strict();
export const cancelSchema = z.object({ reason: text(300).optional() }).strict();

/** A customer telling us they have paid. It is a claim, recorded as such; only verified money settles an invoice. */
export const reportPaymentSchema = z
  .object({ method: z.enum(B2B_PAYMENT_METHODS), amount: paise, receivedDate: day, reference: text(80).optional(), bankName: text(80).optional(), notes: text(500).optional() })
  .strict();

// ---- what the seller may do ------------------------------------------------------------------------
const concessionLine = z
  .object({
    sku: z.string().trim().min(1).max(60),
    /** Either a percentage off the taxable value, or the target unit price (before GST) — never both. */
    discountPercent: z.number().min(0).max(100).optional(),
    unitTaxable: paise.optional(),
    /** Why the price differs from the standard one. Required: every override and discount is audited with its reason. */
    note: z.string().trim().min(5, "say why (at least 5 characters)").max(200),
  })
  .strict()
  .refine((l) => !(l.discountPercent !== undefined && l.unitTaxable !== undefined), { message: "give a discount percentage or a target price, not both" });

export const quoteSchema = z
  .object({
    /** Only lines that differ from the standard price need listing; price-on-request lines MUST be listed with a target price. */
    lines: z.array(concessionLine).max(200).default([]),
    validDays: z.number().int().min(1).max(90).default(7),
    terms: text(1000).optional(),
    message: text(1000).optional(),
    /** false saves a DRAFT quotation for later; true (default) issues it to the customer. */
    issue: z.boolean().default(true),
  })
  .strict();
export type QuoteInput = z.output<typeof quoteSchema>;

const reason = text(300);
export const approvePurchaseOrderSchema = z.object({ note: text(300).optional() }).strict();
/** Turning an approved PO into a sales order is where credit is enforced; an override needs a reason and the credit-override permission. */
export const convertPurchaseOrderSchema = z.object({ creditOverride: z.object({ reason: z.string().trim().min(10).max(300) }).strict().optional() }).strict();
export const allocateOrderSchema = z.object({}).strict();
export const invoiceOrderSchema = z.object({ lines: z.array(z.object({ lineIndex: z.number().int().min(0).max(199), quantity: z.number().int().min(1).max(100_000) }).strict()).min(1).max(200).optional() }).strict();
export const creditApprovalSchema = z.object({ reason: z.string().trim().min(10).max(300) }).strict();
export const rejectSchema = z.object({ reason }).strict();

export const recordPaymentSchema = z
  .object({ customerId: zId, method: z.enum(B2B_PAYMENT_METHODS), amount: paise, receivedDate: day, reference: text(80).optional(), bankName: text(80).optional(), notes: text(500).optional() })
  .strict();
export const allocatePaymentSchema = z.object({ allocations: z.array(z.object({ invoiceId: zId, amount: paise }).strict()).min(1).max(50) }).strict();
export const verifyB2BPaymentSchema = z.object({ note: text(300).optional() }).strict();
export const reversePaymentSchema = z.object({ reason }).strict();

// ---- reads ------------------------------------------------------------------------------------------
export const portalCatalogueQuerySchema = z.object({
  q: z.string().trim().max(80).optional(),
  category: z.string().trim().max(80).optional(),
  metal: z.string().trim().max(20).optional(),
  purity: z.string().trim().max(20).optional(),
  availability: z.enum(["in", "out"]).optional(),
  sort: z.enum(["sku", "name", "price-asc", "price-desc", "stock"]).default("sku"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export type PortalCatalogueQuery = z.output<typeof portalCatalogueQuerySchema>;
