import { describe, expect, it } from "vitest";
import { ORDER_STATUSES, PAYMENT_STATUSES } from "@jewellery/types";
import { CUSTOMER_CANCELLABLE, IllegalOrderTransitionError, ORDER_TRANSITIONS, assertOrderTransition, canAdvancePayment, canTransitionOrder, paymentStatusFor } from "./order-status";
import { isValidOrderAccessToken, orderAccessToken } from "./order-access";

describe("the order lifecycle", () => {
  it("has a rule for every status, and only legal targets", () => {
    for (const s of ORDER_STATUSES) {
      expect(ORDER_TRANSITIONS[s], s).toBeDefined();
      for (const to of ORDER_TRANSITIONS[s]) expect(ORDER_STATUSES).toContain(to);
    }
  });

  it("walks the checkout: DRAFT → PENDING_PAYMENT → PAID → CONFIRMED → PACKED → SHIPPED → DELIVERED", () => {
    const path = ["DRAFT", "PENDING_PAYMENT", "PAID", "CONFIRMED", "PACKED", "SHIPPED", "DELIVERED"] as const;
    for (let i = 1; i < path.length; i++) expect(canTransitionOrder(path[i - 1]!, path[i]!)).toBe(true);
  });

  it("cannot skip payment: nothing reaches CONFIRMED or PAID except through payment", () => {
    for (const s of ORDER_STATUSES) {
      if (s === "PAID") expect(ORDER_TRANSITIONS[s]).not.toContain("PENDING_PAYMENT");
      if (!["PAID"].includes(s)) expect(ORDER_TRANSITIONS[s], `${s} → CONFIRMED`).not.toContain("CONFIRMED");
    }
    expect(canTransitionOrder("DRAFT", "PAID")).toBe(false);
    expect(canTransitionOrder("DRAFT", "CONFIRMED")).toBe(false);
  });

  it("lets a failed payment be retried, and a late success be honoured", () => {
    expect(canTransitionOrder("PAYMENT_FAILED", "PENDING_PAYMENT")).toBe(true);
    expect(canTransitionOrder("PAYMENT_FAILED", "PAID")).toBe(true);
  });

  it("never goes backwards after shipping, and REFUNDED is final", () => {
    expect(canTransitionOrder("SHIPPED", "CANCELLED")).toBe(false);
    expect(canTransitionOrder("DELIVERED", "CANCELLED")).toBe(false);
    expect(canTransitionOrder("PACKED", "CONFIRMED")).toBe(false);
    expect(ORDER_TRANSITIONS.REFUNDED).toEqual([]);
  });

  it("returns run DELIVERED → RETURN_REQUESTED → RETURNED → REFUNDED (or the request is turned down)", () => {
    expect(canTransitionOrder("DELIVERED", "RETURN_REQUESTED")).toBe(true);
    expect(canTransitionOrder("RETURN_REQUESTED", "RETURNED")).toBe(true);
    expect(canTransitionOrder("RETURN_REQUESTED", "DELIVERED")).toBe(true);
    expect(canTransitionOrder("RETURNED", "REFUNDED")).toBe(true);
    expect(canTransitionOrder("CANCELLED", "REFUNDED")).toBe(true);
  });

  it("customers may cancel only until the parcel is packed", () => {
    expect([...CUSTOMER_CANCELLABLE].sort()).toEqual(["CONFIRMED", "PAID", "PAYMENT_FAILED", "PENDING_PAYMENT"]);
  });

  it("assertOrderTransition throws a typed error on an illegal move", () => {
    expect(() => assertOrderTransition("DRAFT", "SHIPPED")).toThrow(IllegalOrderTransitionError);
    expect(() => assertOrderTransition("PAID", "CONFIRMED")).not.toThrow();
  });
});

describe("payment states", () => {
  it("only ever moves forward", () => {
    expect(canAdvancePayment("PENDING", "AUTHORIZED")).toBe(true);
    expect(canAdvancePayment("PENDING", "CAPTURED")).toBe(true);
    expect(canAdvancePayment("AUTHORIZED", "CAPTURED")).toBe(true);
    expect(canAdvancePayment("AUTHORIZED", "PENDING")).toBe(false);
    expect(canAdvancePayment("CAPTURED", "AUTHORIZED")).toBe(false); // a stale, out-of-order event
    expect(canAdvancePayment("CAPTURED", "FAILED")).toBe(false);
    expect(canAdvancePayment("CAPTURED", "CAPTURED")).toBe(false); // a repeat
  });

  it("allows a written-off attempt to turn out to have been paid (the provider is the authority)", () => {
    expect(canAdvancePayment("FAILED", "CAPTURED")).toBe(true);
    expect(canAdvancePayment("FAILED", "AUTHORIZED")).toBe(false);
  });

  it("derives REFUNDED / PARTIALLY_REFUNDED from money actually returned", () => {
    const base = { status: "CAPTURED" as const, capturedAmount: 10_000 };
    expect(paymentStatusFor({ ...base, refundedAmount: 0 })).toBe("CAPTURED");
    expect(paymentStatusFor({ ...base, refundedAmount: 2_500 })).toBe("PARTIALLY_REFUNDED");
    expect(paymentStatusFor({ ...base, refundedAmount: 10_000 })).toBe("REFUNDED");
    expect(paymentStatusFor({ status: "FAILED", capturedAmount: 0, refundedAmount: 0 })).toBe("FAILED");
  });

  it("knows exactly the six payment statuses", () => {
    expect([...PAYMENT_STATUSES]).toEqual(["PENDING", "AUTHORIZED", "CAPTURED", "FAILED", "REFUNDED", "PARTIALLY_REFUNDED"]);
  });
});

describe("order access tokens", () => {
  const secret = "s".repeat(40);
  it("belong to one order, are stable, and cannot be forged or swapped", () => {
    const t = orderAccessToken(secret, "order-1");
    expect(orderAccessToken(secret, "order-1")).toBe(t);
    expect(isValidOrderAccessToken(secret, "order-1", t)).toBe(true);
    expect(isValidOrderAccessToken(secret, "order-2", t)).toBe(false);
    expect(isValidOrderAccessToken("x".repeat(40), "order-1", t)).toBe(false);
    expect(isValidOrderAccessToken(secret, "order-1", undefined)).toBe(false);
    expect(isValidOrderAccessToken(secret, "order-1", t.slice(1))).toBe(false);
  });
});
