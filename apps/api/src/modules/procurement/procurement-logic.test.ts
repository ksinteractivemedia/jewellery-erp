import { describe, expect, it } from "vitest";
import { PURCHASE_REQUISITION_STATUSES, SUPPLIER_INVOICE_STATUSES, SUPPLIER_PAYMENT_STATUSES, SUPPLIER_PURCHASE_ORDER_STATUSES } from "@jewellery/types";
import { purchaseLineInputSchema, receiptLineInputSchema } from "@jewellery/validation";
import {
  IllegalProcurementTransitionError,
  PO_ACTION_TARGETS,
  PO_RULES,
  PO_TRANSITIONS,
  REQUISITION_RULES,
  REQUISITION_TRANSITIONS,
  SUPPLIER_INVOICE_RULES,
  SUPPLIER_PAYMENT_RULES,
  assertPoMove,
  checkPoAction,
  checkRequisitionAction,
  checkSupplierInvoiceAction,
  checkSupplierPaymentAction,
  purchaseOrderStatusFor,
} from "./procurement-status";
import { lineIsClosed, lineOutstanding, roundPaise, totalsOf } from "./procurement-core";

/** Every (action x status) pair is decided by the rule table: allowed exactly from the listed statuses, refused with a typed 409 from every other. */
function exhaust(kind: string, all: readonly string[], rules: Record<string, { from: readonly string[]; to: string }>, check: (action: string, status: string) => string) {
  describe(`${kind}: every action x every status`, () => {
    for (const [action, rule] of Object.entries(rules)) {
      for (const status of all) {
        const allowed = rule.from.includes(status);
        it(`${action} from ${status} is ${allowed ? `allowed -> ${rule.to}` : "refused"}`, () => {
          if (allowed) expect(check(action, status)).toBe(rule.to);
          else expect(() => check(action, status)).toThrow(IllegalProcurementTransitionError);
        });
      }
    }
  });
}
exhaust("purchase requisition", PURCHASE_REQUISITION_STATUSES, REQUISITION_RULES, (a, s) => checkRequisitionAction(a as never, s as never));
exhaust("supplier invoice", SUPPLIER_INVOICE_STATUSES, SUPPLIER_INVOICE_RULES, (a, s) => checkSupplierInvoiceAction(a as never, s as never));
exhaust("supplier payment", SUPPLIER_PAYMENT_STATUSES, SUPPLIER_PAYMENT_RULES, (a, s) => checkSupplierPaymentAction(a as never, s as never));

describe("purchase order: every action x every status (receive's target is derived, so only the guard is checked)", () => {
  for (const [action, rule] of Object.entries(PO_RULES)) {
    for (const status of SUPPLIER_PURCHASE_ORDER_STATUSES) {
      const allowed = (rule.from as readonly string[]).includes(status);
      it(`${action} from ${status} is ${allowed ? "allowed" : "refused"}`, () => {
        if (allowed) expect(() => checkPoAction(action as never, status)).not.toThrow();
        else expect(() => checkPoAction(action as never, status)).toThrow(IllegalProcurementTransitionError);
      });
    }
  }
});

describe("the graphs are exactly what the rules imply", () => {
  it("purchase requisition: every edge is produced by some action, and terminal statuses have no exits", () => {
    for (const from of PURCHASE_REQUISITION_STATUSES) {
      for (const to of PURCHASE_REQUISITION_STATUSES) {
        const viaRule = Object.values(REQUISITION_RULES).some((r) => (r.from as readonly string[]).includes(from) && r.to === to);
        expect(REQUISITION_TRANSITIONS[from].includes(to), `${from} -> ${to}`).toBe(viaRule);
      }
    }
    for (const t of ["REJECTED", "CONVERTED", "CANCELLED"] as const) expect(REQUISITION_TRANSITIONS[t]).toEqual([]);
  });
  it("purchase order: RECEIVED and CANCELLED are final; every other edge matches an action", () => {
    expect(PO_TRANSITIONS.RECEIVED).toEqual([]);
    expect(PO_TRANSITIONS.CANCELLED).toEqual([]);
    expect([...PO_TRANSITIONS.DRAFT].sort()).toEqual(["CANCELLED", "SUBMITTED"]);
    expect([...PO_TRANSITIONS.SUBMITTED].sort()).toEqual(["APPROVED", "CANCELLED"]);
    expect([...PO_TRANSITIONS.APPROVED].sort()).toEqual(["CANCELLED", "PARTIALLY_RECEIVED", "RECEIVED"]);
    expect([...PO_TRANSITIONS.PARTIALLY_RECEIVED].sort()).toEqual(["CANCELLED", "PARTIALLY_RECEIVED", "RECEIVED"]);
  });
});

describe("nothing skips a stage: a derived purchase-order move must still be a legal edge", () => {
  it("receive can move APPROVED -> PARTIALLY_RECEIVED or -> RECEIVED, never further", () => {
    expect(() => assertPoMove("receive", "APPROVED", "PARTIALLY_RECEIVED")).not.toThrow();
    expect(() => assertPoMove("receive", "APPROVED", "RECEIVED")).not.toThrow();
    expect(() => assertPoMove("receive", "RECEIVED", "PARTIALLY_RECEIVED")).toThrow(IllegalProcurementTransitionError);
  });
  it("every action's PO_ACTION_TARGETS entry only names statuses the graph actually reaches from somewhere", () => {
    for (const [action, targets] of Object.entries(PO_ACTION_TARGETS)) {
      for (const target of targets) {
        const reachable = (PO_RULES[action as keyof typeof PO_RULES].from as readonly string[]).some((f) => f === target || PO_TRANSITIONS[f as keyof typeof PO_TRANSITIONS].includes(target as never));
        expect(reachable, `${action} -> ${target}`).toBe(true);
      }
    }
  });
});

describe("a purchase order's status is derived from the numbers", () => {
  it("APPROVED with nothing received, PARTIALLY_RECEIVED with some, RECEIVED when every line is closed", () => {
    expect(purchaseOrderStatusFor({ linesOrdered: 2, linesFullyReceived: 0, anyReceived: false })).toBe("APPROVED");
    expect(purchaseOrderStatusFor({ linesOrdered: 2, linesFullyReceived: 1, anyReceived: true })).toBe("PARTIALLY_RECEIVED");
    expect(purchaseOrderStatusFor({ linesOrdered: 2, linesFullyReceived: 0, anyReceived: true })).toBe("PARTIALLY_RECEIVED");
    expect(purchaseOrderStatusFor({ linesOrdered: 2, linesFullyReceived: 2, anyReceived: true })).toBe("RECEIVED");
  });
});

describe("the workflow's own vocabulary matches the spec exactly", () => {
  it("purchase requisition, purchase order, supplier invoice and supplier payment statuses", () => {
    expect([...PURCHASE_REQUISITION_STATUSES].sort()).toEqual(["APPROVED", "CANCELLED", "CONVERTED", "DRAFT", "REJECTED", "SUBMITTED"].sort());
    expect([...SUPPLIER_PURCHASE_ORDER_STATUSES].sort()).toEqual(["APPROVED", "CANCELLED", "DRAFT", "PARTIALLY_RECEIVED", "RECEIVED", "SUBMITTED"].sort());
    expect([...SUPPLIER_INVOICE_STATUSES].sort()).toEqual(["CANCELLED", "PAID", "PARTIALLY_PAID", "UNPAID"].sort());
    expect([...SUPPLIER_PAYMENT_STATUSES].sort()).toEqual(["RECORDED", "REVERSED"]);
  });
});

// ---- line arithmetic ---------------------------------------------------------------------------------
describe("lineIsClosed / lineOutstanding: weight governs a weight-tracked line, quantity governs everything else", () => {
  const goldLine = { purchaseType: "GOLD" as const, quantity: 1, grossWeight: 500, receivedQuantity: 0, receivedGrossWeight: 0 };
  const jewelleryLine = { purchaseType: "FINISHED_JEWELLERY" as const, quantity: 10, grossWeight: 150, receivedQuantity: 0, receivedGrossWeight: 0 };
  it("a weight-tracked line closes on weight, not quantity", () => {
    expect(lineIsClosed(goldLine)).toBe(false);
    expect(lineIsClosed({ ...goldLine, receivedGrossWeight: 500 })).toBe(true);
    expect(lineOutstanding(goldLine)).toBe(500);
    expect(lineOutstanding({ ...goldLine, receivedGrossWeight: 300 })).toBe(200);
  });
  it("a quantity-tracked line closes on quantity, not weight", () => {
    expect(lineIsClosed(jewelleryLine)).toBe(false);
    expect(lineIsClosed({ ...jewelleryLine, receivedQuantity: 10 })).toBe(true);
    expect(lineOutstanding(jewelleryLine)).toBe(10);
    expect(lineOutstanding({ ...jewelleryLine, receivedQuantity: 6 })).toBe(4);
  });
});

describe("totalsOf", () => {
  it("sums line values and adds tax", () => {
    expect(totalsOf([{ value: 100 }, { value: 250 }], 35)).toEqual({ subtotal: 350, taxAmount: 35, total: 385 });
    expect(totalsOf([])).toEqual({ subtotal: 0, taxAmount: 0, total: 0 });
  });
});

describe("roundPaise", () => {
  it("rounds to the nearest whole paisa", () => {
    expect(roundPaise(100.4)).toBe(100);
    expect(roundPaise(100.5)).toBe(101);
    expect(roundPaise(100.499999)).toBe(100);
  });
});

// ---- validation ---------------------------------------------------------------------------------------
describe("purchaseLineInputSchema", () => {
  const base = { purchaseType: "GOLD" as const, description: "22K gold bar", quantity: 1 };
  it("a weight-tracked line needs metal, purity, gross weight and a rate per gram", () => {
    expect(purchaseLineInputSchema.safeParse(base).success).toBe(false); // nothing else given
    const ok = purchaseLineInputSchema.safeParse({ ...base, metalId: "a".repeat(24), purity: "22K", grossWeight: 500, ratePerGram: 6_500_00 });
    expect(ok.success).toBe(true);
  });
  it("finished jewellery needs metal, purity and a rate per unit, but not a gross weight", () => {
    const line = { purchaseType: "FINISHED_JEWELLERY" as const, description: "Bangles", quantity: 5, metalId: "a".repeat(24), purity: "22K", ratePerUnit: 15_000_00 };
    expect(purchaseLineInputSchema.safeParse(line).success).toBe(true);
    expect(purchaseLineInputSchema.safeParse({ purchaseType: "FINISHED_JEWELLERY", description: "Bangles", quantity: 5 }).success).toBe(false);
  });
  it("a consumable needs neither metal nor purity", () => {
    expect(purchaseLineInputSchema.safeParse({ purchaseType: "CONSUMABLE", description: "Polishing cloth", quantity: 20, ratePerUnit: 5_00 }).success).toBe(true);
  });
  it("refuses an unknown field (strict) and a negative quantity", () => {
    expect(purchaseLineInputSchema.safeParse({ ...base, metalId: "a".repeat(24), purity: "22K", grossWeight: 500, ratePerGram: 650000, value: 1 } as never).success).toBe(false);
    expect(purchaseLineInputSchema.safeParse({ ...base, quantity: -1 }).success).toBe(false);
  });
});

describe("receiptLineInputSchema", () => {
  it("defaults quantity to 1 and requires a location", () => {
    const parsed = receiptLineInputSchema.parse({ purchaseOrderLineIndex: 0, grossWeight: 500, locationId: "a".repeat(24) });
    expect(parsed.quantity).toBe(1);
    expect(receiptLineInputSchema.safeParse({ purchaseOrderLineIndex: 0, grossWeight: 500 }).success).toBe(false); // no locationId
  });
});
