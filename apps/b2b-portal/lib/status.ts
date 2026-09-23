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
  NEGOTIATION: ["Negotiating", "warn"], APPROVED: ["Approved", "good"], REJECTED: ["Rejected", "bad"], EXPIRED: ["Expired", "bad"],
  CONVERTED: ["Order placed", "good"], CANCELLED: ["Cancelled", "neutral"],
};
export const QUOTE_LABEL: Record<QuotationStatus, [string, Tone]> = {
  DRAFT: ["Being prepared", "neutral"], QUOTED: ["Awaiting your answer", "warn"], NEGOTIATION: ["Negotiating", "warn"], APPROVED: ["Accepted", "good"],
  SUPERSEDED: ["Superseded", "neutral"], REJECTED: ["Declined", "bad"], EXPIRED: ["Expired", "bad"], CONVERTED: ["Order placed", "good"],
};
export const SO_LABEL: Record<SalesOrderStatus, [string, Tone]> = {
  DRAFT: ["Held — credit approval", "bad"], CONFIRMED: ["Confirmed", "info"], PARTIALLY_ALLOCATED: ["Stock partly allocated", "info"],
  ALLOCATED: ["Stock allocated", "info"], PARTIALLY_FULFILLED: ["Partly invoiced", "info"], FULFILLED: ["Fulfilled", "good"], CANCELLED: ["Cancelled", "neutral"],
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

const PO_DEAD = ["REJECTED", "EXPIRED", "CANCELLED"];
/**
 * Where an order stands, as a row of steps: PO → quotation (only if there was one) → approved → order placed → stock → invoice →
 * payment. Everything shown is read from the documents — this only arranges it.
 */
export function orderSteps(o: { po?: Pick<B2BPurchaseOrder, "status">; quoted: boolean; order?: Pick<B2BSalesOrder, "status">; invoice?: { status: InvoicePaymentStatus } }): Step[] {
  const so = o.order?.status;
  const poStatus = o.po?.status;
  const poApproved = poStatus === "APPROVED" || poStatus === "CONVERTED";
  const poDead = !!poStatus && PO_DEAD.includes(poStatus);
  const steps: Step[] = [{ label: "Purchase order", state: "done" }];
  if (o.quoted) steps.push({ label: "Quotation", state: "done" });
  steps.push({ label: "Approved", state: poApproved ? "done" : poDead ? "blocked" : "current" });
  if (!so) steps.push({ label: "Order placed", state: poApproved ? "current" : "todo" });
  else steps.push({ label: so === "DRAFT" ? "Credit approval" : "Order placed", state: so === "DRAFT" ? "blocked" : "done", ...(so === "DRAFT" ? { note: "Waiting for our credit team" } : {}) });
  const stockDone = !!so && !["DRAFT", "CONFIRMED"].includes(so);
  const fulfilled = so === "FULFILLED";
  steps.push({ label: "Stock allocated", state: stockDone ? "done" : so === "CONFIRMED" ? "current" : "todo" });
  steps.push({ label: "Invoiced", state: fulfilled ? "done" : so === "PARTIALLY_FULFILLED" ? "current" : stockDone ? "current" : "todo" });
  const inv = o.invoice?.status;
  steps.push({ label: "Paid", state: inv === "PAID" ? "done" : inv ? "current" : "todo", ...(inv === "OVERDUE" ? { note: "Overdue" } : {}) });
  if (so === "CANCELLED" || poDead) steps.forEach((s) => (s.state = s.state === "done" ? "done" : "blocked"));
  return steps;
}
