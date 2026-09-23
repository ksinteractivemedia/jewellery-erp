import { describe, expect, it } from "vitest";
import { B2B_PAYMENT_METHODS, B2B_PAYMENT_STATUSES, PURCHASE_ORDER_STATUSES, QUOTATION_STATUSES, SALES_ORDER_STATUSES } from "@jewellery/types";
import { b2bContactSchema, quoteSchema, reportPaymentSchema, createPurchaseOrderSchema, portalLineSchema } from "@jewellery/validation";
import {
  IllegalB2BTransitionError, PAYMENT_RULES, PAYMENT_TRANSITIONS, PO_RULES, PO_TRANSITIONS, QUOTATION_RULES, QUOTATION_TRANSITIONS, SO_ACTION_TARGETS, SO_RULES, SO_TRANSITIONS,
  assertSoMove, checkPaymentAction, checkPoAction, checkQuotationAction, checkSoAction, salesOrderStatusFor,
} from "./b2b-status";
import { ageInvoices, checkCredit, creditPosition, invoiceStatus, isOverdue } from "./credit";

const TODAY = "2026-09-21";
const pos = (over: Partial<Parameters<typeof creditPosition>[0]> = {}) => creditPosition({ limit: 1_000_000_00, onHold: false, blockOnOverdue: false, invoices: [], committedOrders: [], today: TODAY, ...over });

/** Every (action x status) pair is decided by the rule tables: allowed exactly from the listed statuses, refused with a typed 409 from every other. */
function exhaust(kind: string, all: readonly string[], rules: Record<string, { from: readonly string[]; to: string }>, check: (action: string, status: string) => string) {
  describe(`${kind}: every action x every status`, () => {
    for (const [action, rule] of Object.entries(rules)) {
      for (const status of all) {
        const allowed = rule.from.includes(status);
        it(`${action} from ${status} is ${allowed ? `allowed -> ${rule.to}` : "refused"}`, () => {
          if (allowed) expect(check(action, status)).toBe(rule.to);
          else expect(() => check(action, status)).toThrow(IllegalB2BTransitionError);
        });
      }
    }
  });
}
exhaust("purchase order", PURCHASE_ORDER_STATUSES, PO_RULES, (a, s) => checkPoAction(a as never, s as never));
exhaust("quotation", QUOTATION_STATUSES, QUOTATION_RULES, (a, s) => checkQuotationAction(a as never, s as never));
exhaust("payment", B2B_PAYMENT_STATUSES, PAYMENT_RULES, (a, s) => checkPaymentAction(a as never, s as never));

describe("sales order: every action x every status", () => {
  for (const [action, rule] of Object.entries(SO_RULES)) {
    for (const status of SALES_ORDER_STATUSES) {
      const allowed = (rule.from as readonly string[]).includes(status);
      it(`${action} from ${status} is ${allowed ? "allowed" : "refused"}`, () => {
        if (allowed) expect(() => checkSoAction(action as never, status)).not.toThrow();
        else expect(() => checkSoAction(action as never, status)).toThrow(IllegalB2BTransitionError);
      });
    }
  }
});

describe("the graphs are exactly what the rules imply: no status can be reached any other way", () => {
  it("purchase order: every edge is produced by some action, and terminal statuses have no exits", () => {
    for (const from of PURCHASE_ORDER_STATUSES) for (const to of PURCHASE_ORDER_STATUSES) {
      const viaRule = Object.values(PO_RULES).some((r) => (r.from as readonly string[]).includes(from) && r.to === to);
      expect(PO_TRANSITIONS[from].includes(to), `${from} -> ${to}`).toBe(viaRule);
    }
    for (const t of ["REJECTED", "CONVERTED", "CANCELLED"] as const) expect(PO_TRANSITIONS[t]).toEqual([]);
  });
  it("quotation: same, and the ends are final", () => {
    for (const from of QUOTATION_STATUSES) for (const to of QUOTATION_STATUSES) {
      const viaRule = Object.values(QUOTATION_RULES).some((r) => (r.from as readonly string[]).includes(from) && r.to === to);
      expect(QUOTATION_TRANSITIONS[from].includes(to), `${from} -> ${to}`).toBe(viaRule);
    }
    for (const t of ["REJECTED", "EXPIRED", "CONVERTED", "SUPERSEDED"] as const) expect(QUOTATION_TRANSITIONS[t]).toEqual([]);
  });
  it("payment: verified once, reversed only from verified, rejected final", () => {
    expect(PAYMENT_TRANSITIONS).toEqual({ PENDING_VERIFICATION: ["VERIFIED", "REJECTED"], VERIFIED: ["REVERSED"], REJECTED: [], REVERSED: [] });
  });
  it("sales order: the exact legal edges", () => {
    expect(SO_TRANSITIONS.DRAFT).toEqual(["CONFIRMED", "CANCELLED"]);
    expect([...SO_TRANSITIONS.CONFIRMED].sort()).toEqual(["ALLOCATED", "CANCELLED", "PARTIALLY_ALLOCATED"]);
    expect([...SO_TRANSITIONS.PARTIALLY_ALLOCATED].sort()).toEqual(["ALLOCATED", "CANCELLED", "CONFIRMED", "FULFILLED", "PARTIALLY_ALLOCATED", "PARTIALLY_FULFILLED"]);
    expect([...SO_TRANSITIONS.ALLOCATED].sort()).toEqual(["CANCELLED", "CONFIRMED", "FULFILLED", "PARTIALLY_FULFILLED"]);
    expect([...SO_TRANSITIONS.PARTIALLY_FULFILLED].sort()).toEqual(["CANCELLED", "FULFILLED", "PARTIALLY_FULFILLED"]);
    expect(SO_TRANSITIONS.FULFILLED).toEqual([]);
    expect(SO_TRANSITIONS.CANCELLED).toEqual([]);
  });
  it("nothing skips a stage: a DRAFT can't be allocated, CONFIRMED can't be invoiced, FULFILLED and CANCELLED never move", () => {
    expect(() => assertSoMove("allocate", "DRAFT", "ALLOCATED")).toThrow(IllegalB2BTransitionError);
    expect(() => assertSoMove("invoice", "CONFIRMED", "FULFILLED")).toThrow(IllegalB2BTransitionError);
    expect(() => assertSoMove("invoice", "FULFILLED", "PARTIALLY_FULFILLED")).toThrow(IllegalB2BTransitionError);
    expect(() => assertSoMove("allocate", "CANCELLED", "CONFIRMED")).toThrow(IllegalB2BTransitionError);
    expect(SO_ACTION_TARGETS.invoice).not.toContain("ALLOCATED");
  });
});

describe("a sales order's status is derived from the numbers", () => {
  const f = (total: number, allocated: number, invoiced: number) => salesOrderStatusFor({ total, allocated, invoiced });
  it("moves through every status as stock is held and pieces are invoiced", () => {
    expect(f(10, 0, 0)).toBe("CONFIRMED");
    expect(f(10, 4, 0)).toBe("PARTIALLY_ALLOCATED");
    expect(f(10, 10, 0)).toBe("ALLOCATED");
    expect(f(10, 6, 4)).toBe("PARTIALLY_FULFILLED");
    expect(f(10, 0, 4)).toBe("PARTIALLY_FULFILLED");
    expect(f(10, 0, 10)).toBe("FULFILLED");
  });
});

describe("the workflow's own vocabulary", () => {
  it("purchase orders and quotations use the agreed statuses", () => {
    expect([...PURCHASE_ORDER_STATUSES]).toEqual(["DRAFT", "SUBMITTED", "UNDER_REVIEW", "QUOTED", "NEGOTIATION", "APPROVED", "REJECTED", "EXPIRED", "CONVERTED", "CANCELLED"]);
    expect([...QUOTATION_STATUSES]).toEqual(["DRAFT", "QUOTED", "NEGOTIATION", "APPROVED", "REJECTED", "EXPIRED", "CONVERTED", "SUPERSEDED"]);
  });
  it("sales orders use the agreed statuses", () => {
    expect([...SALES_ORDER_STATUSES]).toEqual(["DRAFT", "CONFIRMED", "PARTIALLY_ALLOCATED", "ALLOCATED", "PARTIALLY_FULFILLED", "FULFILLED", "CANCELLED"]);
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
    expect(quoteSchema.safeParse({ lines: [{ sku: "A", discountPercent: 5, note: "Volume order" }] }).success).toBe(true);
    expect(quoteSchema.safeParse({ lines: [{ sku: "A", unitTaxable: 100, note: "Match a rival" }] }).success).toBe(true);
    expect(quoteSchema.safeParse({ lines: [{ sku: "A", discountPercent: 5, unitTaxable: 100, note: "both at once" }] }).success).toBe(false);
    expect(quoteSchema.safeParse({ lines: [{ sku: "A", discountPercent: 5 }] }).success).toBe(false); // a concession needs its reason
  });
  it("contacts need a name", () => {
    expect(b2bContactSchema.safeParse({ name: "" }).success).toBe(false);
  });
});
