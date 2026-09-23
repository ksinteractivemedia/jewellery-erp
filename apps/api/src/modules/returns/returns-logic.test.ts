import { describe, expect, it } from "vitest";
import { RETURN_STATUSES } from "@jewellery/types";
import { requestReturnSchema, receiveReturnSchema, inspectReturnSchema, settleReturnSchema } from "@jewellery/validation";
import { RETURN_RULES, RETURN_TRANSITIONS, IllegalReturnTransitionError, checkReturnAction } from "./returns-status";

describe("return: every action x every status", () => {
  for (const [action, rule] of Object.entries(RETURN_RULES)) {
    for (const status of RETURN_STATUSES) {
      const allowed = (rule.from as readonly string[]).includes(status);
      it(`${action} from ${status} is ${allowed ? `allowed -> ${rule.to}` : "refused"}`, () => {
        if (allowed) expect(checkReturnAction(action as never, status)).toBe(rule.to);
        else expect(() => checkReturnAction(action as never, status)).toThrow(IllegalReturnTransitionError);
      });
    }
  }
});

describe("the graph is exactly what the rules imply", () => {
  it("every edge is produced by some action, and SETTLED/REJECTED/CANCELLED have no exits", () => {
    for (const from of RETURN_STATUSES) {
      for (const to of RETURN_STATUSES) {
        const viaRule = Object.values(RETURN_RULES).some((r) => (r.from as readonly string[]).includes(from) && r.to === to);
        expect(RETURN_TRANSITIONS[from].includes(to), `${from} -> ${to}`).toBe(viaRule);
      }
    }
    expect(RETURN_TRANSITIONS.SETTLED).toEqual([]);
    expect(RETURN_TRANSITIONS.REJECTED).toEqual([]);
    expect(RETURN_TRANSITIONS.CANCELLED).toEqual([]);
  });
});

describe("the workflow's own vocabulary matches the spec", () => {
  it("REQUESTED -> APPROVED/REJECTED -> RECEIVED -> INSPECTED -> SETTLED, or CANCELLED before the piece is back", () => {
    expect([...RETURN_STATUSES].sort()).toEqual(["APPROVED", "CANCELLED", "INSPECTED", "RECEIVED", "REJECTED", "REQUESTED", "SETTLED"].sort());
    expect(checkReturnAction("cancel", "REQUESTED")).toBe("CANCELLED");
    expect(checkReturnAction("cancel", "APPROVED")).toBe("CANCELLED");
    expect(() => checkReturnAction("cancel", "RECEIVED")).toThrow(); // stock is already in flux — must be seen through
  });
});

describe("requestReturnSchema", () => {
  it("needs an order, at least one item and a reason; refuses an unknown field", () => {
    const base = { orderId: "a".repeat(24), itemIds: ["b".repeat(24)], reason: "DEFECTIVE" as const };
    expect(requestReturnSchema.safeParse(base).success).toBe(true);
    expect(requestReturnSchema.safeParse({ ...base, itemIds: [] }).success).toBe(false);
    expect(requestReturnSchema.safeParse({ ...base, status: "SETTLED" } as never).success).toBe(false);
  });
});

describe("receiveReturnSchema", () => {
  it("needs a destination and at least one line; the observed HUID, if given, must be the shared shape", () => {
    const base = { destinationLocationId: "a".repeat(24), lines: [{ itemId: "b".repeat(24) }] };
    expect(receiveReturnSchema.safeParse(base).success).toBe(true);
    expect(receiveReturnSchema.safeParse({ ...base, lines: [] }).success).toBe(false);
    expect(receiveReturnSchema.safeParse({ destinationLocationId: "a".repeat(24), lines: [{ itemId: "b".repeat(24), observedHuid: "TOOLONG1" }] }).success).toBe(false);
  });
});

describe("inspectReturnSchema", () => {
  it("every line needs a condition", () => {
    expect(inspectReturnSchema.safeParse({ lines: [{ itemId: "a".repeat(24), condition: "GOOD" }] }).success).toBe(true);
    expect(inspectReturnSchema.safeParse({ lines: [{ itemId: "a".repeat(24) }] } as never).success).toBe(false);
  });
});

describe("settleReturnSchema", () => {
  it("needs a method and a non-negative amount", () => {
    expect(settleReturnSchema.safeParse({ method: "REFUND", amount: 500000 }).success).toBe(true);
    expect(settleReturnSchema.safeParse({ method: "REFUND", amount: -1 }).success).toBe(false);
  });
});
