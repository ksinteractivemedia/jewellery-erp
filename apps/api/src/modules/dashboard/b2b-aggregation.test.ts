import { describe, expect, it } from "vitest";
import { aggregateB2B } from "./b2b-aggregation";
import type { B2BFacts } from "./providers";

const NOW = new Date("2026-09-20T06:00:00Z");
const FACTS: B2BFacts = {
  purchaseOrders: [
    { id: "p1", branchId: "b1", status: "PENDING", value: 500_000 },
    { id: "p2", branchId: "b1", status: "PENDING", value: 250_000 },
    { id: "p3", branchId: "b1", status: "CONFIRMED", value: 900_000 },
    { id: "p4", branchId: "b2", status: "PENDING", value: 1 },
  ],
  quotations: [
    { id: "q1", branchId: "b1", status: "PENDING", value: 400_000 },
    { id: "q2", branchId: "b1", status: "ACCEPTED", value: 100 },
    { id: "q3", branchId: "b1", status: "EXPIRED", value: 100 },
  ],
  invoices: [
    { id: "i1", customerId: "c1", branchId: "b1", total: 1_000_000, paid: 400_000, dueDate: new Date("2026-09-10") }, // owes 600k, late
    { id: "i2", customerId: "c1", branchId: "b1", total: 500_000, paid: 0, dueDate: new Date("2026-09-30") }, // owes 500k, not yet due
    { id: "i3", customerId: "c2", branchId: "b1", total: 300_000, paid: 300_000, dueDate: new Date("2026-09-01") }, // settled
    { id: "i4", customerId: "c2", branchId: "b1", total: 200_000, paid: 0, dueDate: new Date("2026-09-19") }, // owes 200k, late
    { id: "i5", customerId: "c3", branchId: "b2", total: 777, paid: 0, dueDate: new Date("2026-09-01") }, // other branch
    { id: "i6", customerId: "c4", branchId: "b1", total: 100, paid: 150, dueDate: new Date("2026-09-01") }, // overpaid: owes nothing
  ],
  creditAccounts: [
    { customerId: "c1", branchId: "b1", limit: 2_000_000, used: 1_100_000 },
    { customerId: "c2", branchId: "b1", limit: 1_000_000, used: 200_000 },
    { customerId: "c3", branchId: "b2", limit: 500, used: 600 },
  ],
};

describe("aggregateB2B", () => {
  const data = aggregateB2B(FACTS, { now: NOW, branchId: "b1" });

  it("counts only what is awaiting a decision as pending, with its value", () => {
    expect(data.pendingPurchaseOrders).toEqual({ count: 2, value: 750_000 });
    expect(data.pendingQuotations).toEqual({ count: 1, value: 400_000 });
  });

  it("sums what customers still owe, ignoring settled and overpaid invoices", () => {
    expect(data.outstanding).toBe(1_300_000); // 600k + 500k + 200k
  });

  it("finds the overdue part: past due date and still owed, with distinct customers", () => {
    expect(data.overdue).toEqual({ amount: 800_000, invoices: 2, customers: 2 }); // 600k (c1) + 200k (c2)
  });

  it("does not call an invoice overdue on the instant it falls due", () => {
    const facts: B2BFacts = { ...FACTS, invoices: [{ id: "x", customerId: "c", branchId: "b1", total: 10, paid: 0, dueDate: NOW }] };
    expect(aggregateB2B(facts, { now: NOW }).overdue).toEqual({ amount: 0, invoices: 0, customers: 0 });
  });

  it("computes credit utilisation as used ÷ limit to one decimal", () => {
    expect(data.creditUtilization).toEqual({ used: 1_300_000, limit: 3_000_000, percentage: 43.3 });
  });

  it("shows utilisation above 100% rather than capping it", () => {
    expect(aggregateB2B(FACTS, { now: NOW, branchId: "b2" }).creditUtilization).toEqual({ used: 600, limit: 500, percentage: 120 });
  });

  it("has no utilisation percentage when there is no credit limit at all", () => {
    expect(aggregateB2B({ ...FACTS, creditAccounts: [] }, { now: NOW }).creditUtilization).toEqual({ used: 0, limit: 0, percentage: null });
  });

  it("spans every branch when none is chosen", () => {
    const all = aggregateB2B(FACTS, { now: NOW });
    expect(all.pendingPurchaseOrders.count).toBe(3);
    expect(all.outstanding).toBe(1_300_000 + 777);
    expect(all.creditUtilization.limit).toBe(3_000_500);
  });

  it("returns honest zeros for an empty book", () => {
    expect(aggregateB2B({ purchaseOrders: [], quotations: [], invoices: [], creditAccounts: [] }, { now: NOW })).toEqual({
      pendingPurchaseOrders: { count: 0, value: 0 }, pendingQuotations: { count: 0, value: 0 }, outstanding: 0,
      overdue: { amount: 0, invoices: 0, customers: 0 }, creditUtilization: { used: 0, limit: 0, percentage: null },
    });
  });
});
