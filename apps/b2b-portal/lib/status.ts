import type { B2BPurchaseOrder, B2BSalesOrder, InvoicePaymentStatus, B2BPaymentStatus, PurchaseOrderStatus, QuotationStatus, SalesOrderStatus } from "@jewellery/types";

export type Tone = "good" | "warn" | "bad" | "info" | "neutral";
export const TONE_CLASS: Record<Tone, string> = {
  good: "border-success bg-success-subtle text-success",
  warn: "border-warning bg-warning-subtle text-warning",
  bad: "border-danger bg-danger-subtle text-danger",
  info: "border-info bg-info-subtle text-info",
  neutral: "border-border bg-surface-sunken text-muted",
};

export const PO_LABEL: Record<PurchaseOrderStatus, [string, Tone]> = {
  DRAFT: ["Draft", "neutral"], SUBMITTED: ["Submitted", "info"], UNDER_REVIEW: ["In review", "info"], QUOTED: ["Quoted", "warn"],
  NEGOTIATING: ["Negotiating", "warn"], APPROVED: ["Approved", "good"], REJECTED: ["Rejected", "bad"], CANCELLED: ["Cancelled", "neutral"],
};
export const QUOTE_LABEL: Record<QuotationStatus, [string, Tone]> = {
  ISSUED: ["Awaiting your answer", "warn"], ACCEPTED: ["Accepted", "good"], REVISION_REQUESTED: ["Revision requested", "info"],
  SUPERSEDED: ["Superseded", "neutral"], REJECTED: ["Declined", "bad"], EXPIRED: ["Expired", "bad"],
};
export const SO_LABEL: Record<SalesOrderStatus, [string, Tone]> = {
  PENDING_CREDIT_APPROVAL: ["Held — credit approval", "bad"], APPROVED: ["Approved", "info"], ALLOCATED: ["Stock allocated", "info"], INVOICED: ["Invoiced", "good"], CANCELLED: ["Cancelled", "neutral"],
};
export const INVOICE_LABEL: Record<InvoicePaymentStatus, [string, Tone]> = {
  UNPAID: ["Unpaid", "warn"], PARTIALLY_PAID: ["Part paid", "info"], PAID: ["Paid", "good"], OVERDUE: ["Overdue", "bad"], CANCELLED: ["Cancelled", "neutral"],
};
export const PAYMENT_LABEL: Record<B2BPaymentStatus, [string, Tone]> = {
  PENDING_VERIFICATION: ["Awaiting verification", "warn"], VERIFIED: ["Verified", "good"], REJECTED: ["Rejected", "bad"], REVERSED: ["Reversed", "bad"],
};
export const METHOD_LABEL: Record<string, string> = { BANK_TRANSFER: "Bank transfer", NEFT: "NEFT", RTGS: "RTGS", IMPS: "IMPS", CHEQUE: "Cheque", CASH: "Cash", OTHER: "Other" };
export const BASIS_LABEL: Record<string, string> = { CUSTOMER: "Your special price", CUSTOMER_GROUP: "Group price", PRICE_LIST: "Price list", CATEGORY: "Category rate", DEFAULT: "Standard wholesale" };

export interface Step { label: string; state: "done" | "current" | "todo" | "blocked"; note?: string }

/**
 * Where an order stands, as a row of steps: PO → quotation (only if there was one) → approval → stock → invoice → payment. Everything
 * shown is read from the documents — this only arranges it.
 */
export function orderSteps(o: { po?: Pick<B2BPurchaseOrder, "status">; quoted: boolean; order?: Pick<B2BSalesOrder, "status">; invoice?: { status: InvoicePaymentStatus } }): Step[] {
  const so = o.order?.status;
  const steps: Step[] = [{ label: "Purchase order", state: "done" }];
  if (o.quoted) steps.push({ label: "Quotation", state: "done" });
  if (!so) steps.push({ label: "Seller review", state: o.po?.status === "REJECTED" || o.po?.status === "CANCELLED" ? "blocked" : "current" });
  else steps.push({ label: so === "PENDING_CREDIT_APPROVAL" ? "Credit approval" : "Approved", state: so === "PENDING_CREDIT_APPROVAL" ? "blocked" : "done", ...(so === "PENDING_CREDIT_APPROVAL" ? { note: "Waiting for our credit team" } : {}) });
  const past = (s: SalesOrderStatus) => !!so && (so === "INVOICED" || (s === "ALLOCATED" && so === "ALLOCATED"));
  steps.push({ label: "Stock allocated", state: past("ALLOCATED") ? "done" : so === "APPROVED" ? "current" : "todo" });
  steps.push({ label: "Invoiced", state: so === "INVOICED" ? "done" : so === "ALLOCATED" ? "current" : "todo" });
  const inv = o.invoice?.status;
  steps.push({ label: "Paid", state: inv === "PAID" ? "done" : inv ? "current" : "todo", ...(inv === "OVERDUE" ? { note: "Overdue" } : {}) });
  if (so === "CANCELLED") steps.forEach((s) => (s.state = s.state === "done" ? "done" : "blocked"));
  return steps;
}
