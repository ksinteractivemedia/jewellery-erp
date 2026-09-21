import { describe, expect, it } from "vitest";
import { B2B_PAYMENT_METHODS, PURCHASE_ORDER_STATUSES, SALES_ORDER_STATUSES } from "@jewellery/types";
import { b2bContactSchema, quoteSchema, reportPaymentSchema, createPurchaseOrderSchema, portalLineSchema } from "@jewellery/validation";
import { PAYMENT_TRANSITIONS, PO_TRANSITIONS, SO_TRANSITIONS, assertPoTransition, assertSoTransition, assertPaymentTransition } from "./b2b-status";
import { ageInvoices, checkCredit, creditPosition, invoiceStatus, isOverdue } from "./credit";

const TODAY = "2026-09-21";
const pos = (over: Partial<Parameters<typeof creditPosition>[0]> = {}) => creditPosition({ limit: 1_000_000_00, onHold: false, blockOnOverdue: false, invoices: [], committedOrders: [], today: TODAY, ...over });

describe("purchase order and sales order lifecycles", () => {
  it("cover every status", () => {
    for (const s of PURCHASE_ORDER_STATUSES) expect(PO_TRANSITIONS[s], s).toBeDefined();
    for (const s of SALES_ORDER_STATUSES) expect(SO_TRANSITIONS[s], s).toBeDefined();
  });
  it("PO: draft → submitted → reviewed → quoted ⇄ negotiating → approved; terminals stay terminal", () => {
    expect(() => assertPoTransition("DRAFT", "SUBMITTED")).not.toThrow();
    expect(() => assertPoTransition("SUBMITTED", "UNDER_REVIEW")).not.toThrow();
    expect(() => assertPoTransition("UNDER_REVIEW", "QUOTED")).not.toThrow();
    expect(() => assertPoTransition("QUOTED", "NEGOTIATING")).not.toThrow();
    expect(() => assertPoTransition("NEGOTIATING", "QUOTED")).not.toThrow();
    expect(() => assertPoTransition("QUOTED", "APPROVED")).not.toThrow();
    for (const t of ["APPROVED", "REJECTED", "CANCELLED"] as const) expect(PO_TRANSITIONS[t]).toEqual([]);
  });
  it("PO: a draft cannot skip review, and an approved PO cannot be reopened", () => {
    expect(() => assertPoTransition("DRAFT", "APPROVED")).toThrow(/cannot go from DRAFT to APPROVED/);
    expect(() => assertPoTransition("APPROVED", "QUOTED")).toThrow();
  });
  it("sales order: nothing is invoiced before it is allocated, or allocated before it is approved", () => {
    expect(() => assertSoTransition("PENDING_CREDIT_APPROVAL", "ALLOCATED")).toThrow();
    expect(() => assertSoTransition("APPROVED", "INVOICED")).toThrow();
    expect(() => assertSoTransition("PENDING_CREDIT_APPROVAL", "APPROVED")).not.toThrow();
    expect(() => assertSoTransition("APPROVED", "ALLOCATED")).not.toThrow();
    expect(() => assertSoTransition("ALLOCATED", "INVOICED")).not.toThrow();
    expect(SO_TRANSITIONS.INVOICED).toEqual([]);
  });
  it("payment: verified once; only a verified payment can be reversed; rejected is final", () => {
    expect(() => assertPaymentTransition("PENDING_VERIFICATION", "VERIFIED")).not.toThrow();
    expect(() => assertPaymentTransition("VERIFIED", "REVERSED")).not.toThrow();
    expect(() => assertPaymentTransition("PENDING_VERIFICATION", "REVERSED")).toThrow();
    expect(PAYMENT_TRANSITIONS.REJECTED).toEqual([]);
  });
});

describe("credit position", () => {
  it("derives outstanding, committed, overdue and available from invoices and approved orders", () => {
    const p = pos({ invoices: [{ balance: 300_000_00, dueDate: "2026-10-01" }, { balance: 200_000_00, dueDate: "2026-09-10" }], committedOrders: [150_000_00] });
    expect(p).toMatchObject({ outstanding: 500_000_00, committed: 150_000_00, overdue: 200_000_00, available: 350_000_00, limit: 1_000_000_00 });
  });
  it("is not overdue on the due date itself, but is the day after", () => {
    expect(isOverdue("2026-09-21", TODAY)).toBe(false);
    expect(isOverdue("2026-09-20", TODAY)).toBe(true);
  });
  it("goes negative when over the limit, so the number says by how much", () => {
    expect(pos({ invoices: [{ balance: 1_200_000_00, dueDate: "2026-12-01" }] }).available).toBe(-200_000_00);
  });
});

describe("credit check", () => {
  it("passes an order that fits", () => {
    const c = checkCredit(pos({ invoices: [{ balance: 400_000_00, dueDate: "2026-10-01" }] }), 500_000_00);
    expect(c.requiresApproval).toBe(false);
    expect(c.reasons).toEqual([]);
    expect(c.exposureAfter).toBe(900_000_00);
  });
  it("passes an order that exactly reaches the limit, and stops one that is a rupee over", () => {
    expect(checkCredit(pos(), 1_000_000_00).requiresApproval).toBe(false);
    const over = checkCredit(pos(), 1_000_000_00 + 100);
    expect(over.requiresApproval).toBe(true);
    expect(over.wouldExceedBy).toBe(100);
  });
  it("counts approved-but-uninvoiced orders against the limit", () => {
    const c = checkCredit(pos({ committedOrders: [900_000_00] }), 200_000_00);
    expect(c.reasons.map((r) => r.code)).toEqual(["CREDIT_LIMIT_EXCEEDED"]);
    expect(c.wouldExceedBy).toBe(100_000_00);
  });
  it("gives an actionable message: what is over, and what to do", () => {
    const c = checkCredit(pos({ invoices: [{ balance: 900_000_00, dueDate: "2026-10-01" }] }), 300_000_00);
    const r = c.reasons[0]!;
    expect(r.message).toContain("₹2,00,000");
    expect(r.message).toContain("₹10,00,000");
    expect(r.action).toMatch(/Pay .*outstanding invoices, reduce the order, or ask for a limit increase/);
  });
  it("a credit hold blocks regardless of headroom", () => {
    const c = checkCredit(pos({ onHold: true }), 1_00);
    expect(c.reasons.map((r) => r.code)).toEqual(["ACCOUNT_ON_HOLD"]);
    expect(c.requiresApproval).toBe(true);
  });
  it("overdue blocks only when the account is set to block on overdue", () => {
    const inv = [{ balance: 10_000_00, dueDate: "2026-08-01" }];
    expect(checkCredit(pos({ invoices: inv }), 1_00).requiresApproval).toBe(false);
    expect(checkCredit(pos({ invoices: inv, blockOnOverdue: true }), 1_00).reasons.map((r) => r.code)).toEqual(["OVERDUE_INVOICES"]);
  });
  it("can give several reasons at once", () => {
    const c = checkCredit(pos({ onHold: true, blockOnOverdue: true, invoices: [{ balance: 999_000_00, dueDate: "2026-08-01" }] }), 500_000_00);
    expect(c.reasons.map((r) => r.code).sort()).toEqual(["ACCOUNT_ON_HOLD", "CREDIT_LIMIT_EXCEEDED", "OVERDUE_INVOICES"]);
  });
});

describe("invoice status and ageing", () => {
  const base = { total: 100_000_00, dueDate: "2026-10-01", today: TODAY };
  it("derives the status from what has been paid and the due date", () => {
    expect(invoiceStatus({ ...base, paid: 0 })).toBe("UNPAID");
    expect(invoiceStatus({ ...base, paid: 40_000_00 })).toBe("PARTIALLY_PAID");
    expect(invoiceStatus({ ...base, paid: 100_000_00 })).toBe("PAID");
    expect(invoiceStatus({ ...base, paid: 0, dueDate: "2026-09-01" })).toBe("OVERDUE");
    expect(invoiceStatus({ ...base, paid: 100_000_00, dueDate: "2026-09-01" })).toBe("PAID");
    expect(invoiceStatus({ ...base, paid: 0, cancelled: true })).toBe("CANCELLED");
  });
  it("buckets balances by days past due", () => {
    const a = ageInvoices(
      [{ balance: 1, dueDate: "2026-10-05" }, { balance: 2, dueDate: "2026-09-21" }, { balance: 4, dueDate: "2026-09-11" }, { balance: 8, dueDate: "2026-08-01" }, { balance: 16, dueDate: "2026-07-01" }, { balance: 32, dueDate: "2026-04-01" }, { balance: 0, dueDate: "2020-01-01" }],
      TODAY
    );
    expect(a).toEqual({ current: 3, days1to30: 4, days31to60: 8, days61to90: 16, over90: 32 });
  });
});

describe("shared vocabulary and request schemas", () => {
  it("validation and types agree on the payment methods", () => {
    expect(reportPaymentSchema.shape.method.options).toEqual([...B2B_PAYMENT_METHODS]);
  });
  it("supports exactly the offline methods asked for", () => {
    expect([...B2B_PAYMENT_METHODS]).toEqual(["BANK_TRANSFER", "NEFT", "RTGS", "IMPS", "CHEQUE", "CASH", "OTHER"]);
  });
  it("refuses a price, discount or total on a buyer's line or order", () => {
    expect(portalLineSchema.safeParse({ sku: "A", quantity: 1 }).success).toBe(true);
    for (const extra of [{ unitPrice: 1 }, { price: 1 }, { discount: 5 }, { total: 1 }]) expect(portalLineSchema.safeParse({ sku: "A", quantity: 1, ...extra }).success).toBe(false);
    const po = { lines: [{ sku: "A", quantity: 1 }], shippingAddressIndex: 0, submit: true };
    expect(createPurchaseOrderSchema.safeParse(po).success).toBe(true);
    expect(createPurchaseOrderSchema.safeParse({ ...po, total: 1 }).success).toBe(false);
  });
  it("a concession is a percentage OR a target price, never both", () => {
    expect(quoteSchema.safeParse({ lines: [{ sku: "A", discountPercent: 5 }] }).success).toBe(true);
    expect(quoteSchema.safeParse({ lines: [{ sku: "A", unitTaxable: 100 }] }).success).toBe(true);
    expect(quoteSchema.safeParse({ lines: [{ sku: "A", discountPercent: 5, unitTaxable: 100 }] }).success).toBe(false);
  });
  it("contacts need a name", () => {
    expect(b2bContactSchema.safeParse({ name: "" }).success).toBe(false);
  });
});
